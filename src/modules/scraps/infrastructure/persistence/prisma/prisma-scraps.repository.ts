import { AuditAction, ScrapStatus } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

export class PrismaScrapsRepository {
  private readonly auditRepo = new PrismaAuditRepository();

  async registerFromQuote(input: { quoteId: string; generatedByEmail: string }) {
    const quote = await prismaClient.quote.findUnique({
      where: { id: input.quoteId },
      include: {
        sku: {
          include: {
            widthUnit: true,
            lengthUnit: true
          }
        }
      }
    });
    if (!quote) throw new Error("Quote not found.");

    const generatedBy = await prismaClient.appUser.findUnique({ where: { email: input.generatedByEmail } });
    if (!generatedBy) throw new Error("User not found.");

    const skuWidthM = Number(quote.sku.widthValue) * Number(quote.sku.widthUnit.toMeterFactor);
    const skuLengthM = Number(quote.sku.lengthValue) * Number(quote.sku.lengthUnit.toMeterFactor);
    const skuArea = skuWidthM * skuLengthM;

    const requestedArea =
      Number(quote.requestedWidthM) * Number(quote.requestedHeightM) * Number(quote.quantity);

    const scrapArea = Math.max(skuArea - requestedArea, 0);
    const scrapHeight = skuWidthM > 0 ? scrapArea / skuWidthM : 0;

    const threshold = await this.getGlobalThresholdArea(quote.branchId);
    const status = scrapArea >= threshold && scrapArea > 0 ? ScrapStatus.PENDING_STORAGE : ScrapStatus.DISCARDED;

    const scrap = await prismaClient.scrap.create({
      data: {
        branchId: quote.branchId,
        skuId: quote.skuId,
        quoteId: quote.id,
        widthM: skuWidthM,
        heightM: scrapHeight,
        areaM2: scrapArea,
        status,
        generatedBy: generatedBy.id
      }
    });
    await this.auditRepo.log({
      branchId: quote.branchId,
      actorUserId: generatedBy.id,
      entityType: "scrap",
      entityId: scrap.id,
      action: AuditAction.CREATE,
      afterJson: {
        quoteId: quote.id,
        status: scrap.status,
        areaM2: Number(scrap.areaM2)
      }
    });

    return scrap;
  }

  async match(params: {
    branchCode: string;
    skuCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    limit?: number;
  }) {
    const scraps = await prismaClient.scrap.findMany({
      where: {
        status: ScrapStatus.STORED,
        branch: { code: params.branchCode },
        sku: { code: params.skuCode },
        widthM: { gte: params.requestedWidthM },
        heightM: { gte: params.requestedHeightM },
        allocations: { none: { isActive: true } }
      },
      include: { sku: true, location: true },
      take: params.limit ?? 10
    });

    const requestedArea = params.requestedWidthM * params.requestedHeightM;
    return scraps
      .map((s) => ({ ...s, excessAreaM2: Number(s.areaM2) - requestedArea }))
      .sort((a, b) => a.excessAreaM2 - b.excessAreaM2);
  }

  async allocateToSaleLine(input: { saleLineId: string; scrapId: string; allocatedByEmail: string }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.allocatedByEmail } });
    if (!user) throw new Error("User not found.");

    const scrap = await prismaClient.scrap.findUnique({ where: { id: input.scrapId } });
    if (!scrap) throw new Error("Scrap not found.");
    if (scrap.status !== ScrapStatus.STORED) throw new Error("Scrap must be STORED to be allocated.");

    const existing = await prismaClient.saleLineScrapAllocation.findFirst({
      where: { scrapId: input.scrapId, isActive: true }
    });
    if (existing) throw new Error("Scrap already has an active allocation.");

    const saleLine = await prismaClient.saleLine.findUnique({
      where: { id: input.saleLineId },
      include: { sale: true }
    });
    if (!saleLine) throw new Error("Sale line not found.");
    if (saleLine.sale.status !== "DRAFT") throw new Error("Can only allocate to DRAFT sale lines.");

    const lineAllocation = await prismaClient.saleLineScrapAllocation.findFirst({
      where: { saleLineId: input.saleLineId, isActive: true }
    });
    if (lineAllocation) throw new Error("Sale line already has an active allocation.");

    const allocation = await prismaClient.saleLineScrapAllocation.create({
      data: {
        saleLineId: input.saleLineId,
        scrapId: input.scrapId,
        allocatedBy: user.id,
        allocatedAt: new Date()
      }
    });
    await this.auditRepo.log({
      branchId: scrap.branchId,
      actorUserId: user.id,
      entityType: "sale_line_scrap_allocation",
      entityId: allocation.id,
      action: AuditAction.CREATE,
      afterJson: { saleLineId: input.saleLineId, scrapId: input.scrapId }
    });
    return allocation;
  }

  async releaseAllocation(input: { saleLineId: string; releasedByEmail: string }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.releasedByEmail } });
    if (!user) throw new Error("User not found.");

    const allocation = await prismaClient.saleLineScrapAllocation.findFirst({
      where: { saleLineId: input.saleLineId, isActive: true },
      include: { scrap: true }
    });
    if (!allocation) throw new Error("No active allocation for this sale line.");

    const saleLine = await prismaClient.saleLine.findUnique({
      where: { id: input.saleLineId },
      include: { sale: true }
    });
    if (!saleLine) throw new Error("Sale line not found.");
    if (saleLine.sale.status !== "DRAFT") throw new Error("Can only release allocation from DRAFT sale lines.");

    await prismaClient.saleLineScrapAllocation.update({
      where: { id: allocation.id },
      data: { isActive: false, releasedAt: new Date() }
    });
    await this.auditRepo.log({
      branchId: allocation.scrap.branchId,
      actorUserId: user.id,
      entityType: "sale_line_scrap_allocation",
      entityId: allocation.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { isActive: true },
      afterJson: { isActive: false, releasedAt: new Date().toISOString() }
    });
  }

  async registerFromCutJob(input: {
    cutJobId: string;
    saleLineId: string;
    branchId: string;
    skuId: string;
    scrapWidthM: number;
    scrapHeightM: number;
    generatedByEmail: string;
  }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.generatedByEmail } });
    if (!user) throw new Error("User not found.");

    const area = round2(input.scrapWidthM * input.scrapHeightM);
    const threshold = await this.getGlobalThresholdArea(input.branchId);
    const status = area >= threshold && area > 0 ? ScrapStatus.PENDING_STORAGE : ScrapStatus.DISCARDED;

    const scrap = await prismaClient.scrap.create({
      data: {
        branchId: input.branchId,
        skuId: input.skuId,
        cutJobId: input.cutJobId,
        saleLineId: input.saleLineId,
        widthM: input.scrapWidthM,
        heightM: input.scrapHeightM,
        areaM2: area,
        status,
        generatedBy: user.id
      }
    });
    await this.auditRepo.log({
      branchId: input.branchId,
      actorUserId: user.id,
      entityType: "scrap",
      entityId: scrap.id,
      action: AuditAction.CREATE,
      afterJson: {
        cutJobId: input.cutJobId,
        saleLineId: input.saleLineId,
        status: scrap.status,
        areaM2: Number(scrap.areaM2)
      }
    });
    return scrap;
  }

  async getGlobalThresholdArea(branchId: string): Promise<number> {
    const skus = await prismaClient.fabricSku.findMany({
      where: { branchId, isActive: true },
      include: { widthUnit: true, lengthUnit: true }
    });

    const areas = skus
      .map((sku) => {
        const widthM = Number(sku.widthValue) * Number(sku.widthUnit.toMeterFactor);
        const lengthM = Number(sku.lengthValue) * Number(sku.lengthUnit.toMeterFactor);
        return widthM * lengthM;
      })
      .filter((area) => area > 0);

    if (areas.length === 0) return 0;
    return Math.min(...areas);
  }

  async list(params: { branchCode?: string; status?: string }) {
    const status = parseScrapStatus(params.status);
    return prismaClient.scrap.findMany({
      where: {
        branch: params.branchCode ? { code: params.branchCode } : undefined,
        status
      },
      include: {
        location: true,
        sku: true,
        quote: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async createStorageLocation(input: {
    branchCode: string;
    createdByEmail: string;
    code: string;
    description?: string;
  }) {
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    const user = await prismaClient.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !user) throw new Error("Branch/user not found.");

    const location = await prismaClient.storageLocation.create({
      data: {
        branchId: branch.id,
        code: input.code,
        description: input.description,
        createdBy: user.id
      }
    });
    await this.auditRepo.log({
      branchId: branch.id,
      actorUserId: user.id,
      entityType: "storage_location",
      entityId: location.id,
      action: AuditAction.CREATE,
      afterJson: { code: location.code, description: location.description ?? null }
    });
    return location;
  }

  async assignLocation(input: { scrapId: string; locationCode: string; classifiedByEmail: string }) {
    const scrap = await prismaClient.scrap.findUnique({ where: { id: input.scrapId } });
    if (!scrap) throw new Error("Scrap not found.");

    const user = await prismaClient.appUser.findUnique({ where: { email: input.classifiedByEmail } });
    if (!user) throw new Error("User not found.");

    const location = await prismaClient.storageLocation.findFirst({
      where: { branchId: scrap.branchId, code: input.locationCode, isActive: true }
    });
    if (!location) throw new Error("Location not found.");

    if (scrap.status !== ScrapStatus.PENDING_STORAGE) {
      throw new Error("Only PENDING_STORAGE scrap can be assigned.");
    }

    const updated = await prismaClient.scrap.update({
      where: { id: scrap.id },
      data: {
        locationId: location.id,
        status: ScrapStatus.STORED,
        classifiedBy: user.id,
        classifiedAt: new Date()
      }
    });
    await this.auditRepo.log({
      branchId: scrap.branchId,
      actorUserId: user.id,
      entityType: "scrap",
      entityId: scrap.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: scrap.status, locationId: scrap.locationId },
      afterJson: { status: updated.status, locationId: updated.locationId }
    });
    return updated;
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function parseScrapStatus(value?: string): ScrapStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  const allowed: ScrapStatus[] = [
    ScrapStatus.PENDING_CLASSIFICATION,
    ScrapStatus.DISCARDED,
    ScrapStatus.PENDING_STORAGE,
    ScrapStatus.STORED,
    ScrapStatus.USED
  ];
  return allowed.includes(normalized as ScrapStatus) ? (normalized as ScrapStatus) : undefined;
}
