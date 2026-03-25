import { Injectable } from "@nestjs/common";
import { AuditAction, PrismaClient, ScrapStatus, SoftHoldStatus } from "@prisma/client";
import { AppNotFoundError } from "../../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaSettingsRepository } from "../../../../settings/infrastructure/persistence/prisma/prisma-settings.repository";
import { evaluateScrapRule, type ScrapLocationPolicy, type ScrapRuleContext } from "../../../domain/scrap-policy";
import { ScrapAllocationService } from "../../services/scrap-allocation.service";
import { ScrapCutOperationsService } from "../../services/scrap-cut-operations.service";
import { ScrapMatchingService } from "../../services/scrap-matching.service";
import { ScrapSoftHoldsService } from "../../services/scrap-soft-holds.service";
import { ScrapStorageLocationsService } from "../../services/scrap-storage-locations.service";

@Injectable()
export class PrismaScrapsRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository,
    private readonly settingsRepo: PrismaSettingsRepository,
    private readonly allocations: ScrapAllocationService,
    private readonly cutOperations: ScrapCutOperationsService,
    private readonly matching: ScrapMatchingService,
    private readonly softHolds: ScrapSoftHoldsService,
    private readonly storageLocations: ScrapStorageLocationsService
  ) {}

  async registerFromQuote(input: { quoteId: string; generatedByEmail: string }) {
    const quote = await this.prisma.quote.findUnique({
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
    if (!quote) throw new AppNotFoundError("Cotización no encontrada.");

    const generatedBy = await this.prisma.appUser.findUnique({ where: { email: input.generatedByEmail } });
    if (!generatedBy) throw new AppNotFoundError("Usuario no encontrado.");

    const skuWidthM = Number(quote.sku.widthValue) * Number(quote.sku.widthUnit.toMeterFactor);
    const scrapWidthM = Math.max(skuWidthM - Number(quote.requestedWidthM), 0);
    const scrapHeightM = Math.max(Number(quote.requestedHeightM), 0);
    const areaM2 = round3(scrapWidthM * scrapHeightM);
    const policy = await this.settingsRepo.getScrapPolicy();
    const context = buildScrapRuleContext({
      scrapWidthM,
      scrapHeightM,
      skuWidthM,
      skuLengthM: Number(quote.sku.lengthValue) * Number(quote.sku.lengthUnit.toMeterFactor),
      skuThicknessM: 0
    });
    const isUseful = scrapWidthM > 0 && scrapHeightM > 0 && evaluateScrapRule(policy.classificationRule, context);
    const status = isUseful ? ScrapStatus.PENDING_INBOUND : ScrapStatus.DISCARDED;

    const scrap = await this.prisma.scrap.create({
      data: {
        branchId: quote.branchId,
        skuId: quote.skuId,
        quoteId: quote.id,
        widthM: scrapWidthM,
        heightM: scrapHeightM,
        areaM2,
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
        areaM2: Number(scrap.areaM2),
        isUseful
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
    return this.matching.match(params);
  }

  async previewQuoteOpportunity(params: {
    branchCode: string;
    items: Array<{
      itemId: string;
      itemIndex: number;
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
    }>;
  }) {
    return this.matching.previewQuoteOpportunity(params);
  }

  async matchForCutJob(params: {
    cutJobId: string;
    scope: "CURRENT_LINE" | "ENTIRE_ORDER";
    maxPerLine: number;
  }) {
    return this.matching.matchForCutJob(params);
  }

  async matchForSaleLines(params: {
    saleId: string;
    lineIds?: string[];
    limitPerLine: number;
  }) {
    return this.matching.matchForSaleLines(params);
  }

  async getPickListView(input: {
    saleId: string;
    items: Array<{ saleLineId: string; scrapId: string }>;
  }) {
    return this.allocations.getPickListView(input);
  }

  async matchForSaleLine(params: { saleId: string; saleLineId: string; limit?: number }) {
    return this.matching.matchForSaleLine(params);
  }

  async allocateToSaleLine(input: { saleLineId: string; scrapId: string; allocatedByEmail: string }) {
    return this.allocations.allocateToSaleLine(input);
  }

  async allocateToSaleLinePiece(input: {
    saleLineId: string;
    saleLinePieceId: string;
    scrapId: string;
    allocatedByEmail: string;
  }) {
    return this.allocations.allocateToSaleLinePiece(input);
  }

  async releaseAllocation(input: { saleLineId: string; releasedByEmail: string }) {
    return this.allocations.releaseAllocation(input);
  }

  async releasePieceAllocation(input: {
    saleLineId: string;
    saleLinePieceId: string;
    releasedByEmail: string;
  }) {
    return this.allocations.releasePieceAllocation(input);
  }

  async previewAutoAssignment(params: { saleId: string; limitPerPiece?: number }) {
    return this.matching.previewAutoAssignment(params);
  }

  async commitAutoAssignment(input: {
    saleId: string;
    allocatedByEmail: string;
    items: Array<{ saleLineId: string; saleLinePieceId: string; scrapId: string }>;
  }) {
    return this.allocations.commitAutoAssignment(input);
  }

  async registerFromCutJob(input: {
    cutJobId: string;
    saleLineId: string;
    saleLinePieceId?: string;
    branchId: string;
    skuId: string;
    scrapWidthM: number;
    scrapHeightM: number;
    generatedByEmail: string;
    locationPolicy: ScrapLocationPolicy;
    locationCode?: string;
  }) {
    return this.cutOperations.registerFromCutJob(input);
  }

  async list(params: { branchCode?: string; status?: string; page?: number; limit?: number; quoteNumber?: number }) {
    const status = parseScrapStatus(params.status);
    const limit = Math.min(params.limit ?? 8, 100);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * limit;
    const where = {
      branch: params.branchCode ? { code: params.branchCode } : undefined,
      status,
      ...(params.quoteNumber ? { saleLine: { sale: { quoteNumber: params.quoteNumber } } } : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.scrap.findMany({
        where,
        include: {
          location: true,
          sku: true,
          quote: true,
          saleLine: { include: { sale: { select: { quoteNumber: true } } } }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      this.prisma.scrap.count({ where })
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async createStorageLocation(input: {
    branchCode: string;
    createdByEmail: string;
    code: string;
    description?: string;
  }) {
    return this.storageLocations.createStorageLocation(input);
  }

  async listStorageLocations(branchCode: string, page = 1, limit = 50) {
    return this.storageLocations.listStorageLocations(branchCode, page, limit);
  }

  async updateStorageLocation(id: string, input: { code?: string; description?: string; actorEmail: string }) {
    return this.storageLocations.updateStorageLocation(id, input);
  }

  async deleteStorageLocation(id: string, actorEmail: string) {
    return this.storageLocations.deleteStorageLocation(id, actorEmail);
  }

  async toggleStorageLocationStatus(id: string, actorEmail: string) {
    return this.storageLocations.toggleStorageLocationStatus(id, actorEmail);
  }

  async assignLocation(input: { scrapId: string; locationCode: string; classifiedByEmail: string }) {
    return this.storageLocations.assignLocation(input);
  }

  async bulkPreviewStorageLocations(input: {
    branchCode: string;
    rowMode: "LETTER" | "FIXED";
    rowStart: string;
    rowEnd: string;
    colStart: number;
    colEnd: number;
    separator: string;
    descriptionTemplate?: string;
  }) {
    return this.storageLocations.bulkPreviewStorageLocations(input);
  }

  async bulkCreateStorageLocations(input: {
    branchCode: string;
    rowMode: "LETTER" | "FIXED";
    rowStart: string;
    rowEnd: string;
    colStart: number;
    colEnd: number;
    separator: string;
    descriptionTemplate?: string;
    createdByEmail: string;
  }) {
    return this.storageLocations.bulkCreateStorageLocations(input);
  }

  // SPEC-58: Lazy expiration — expire stale holds
  async expireStaleHolds() {
    return this.softHolds.expireStaleHolds();
  }

  async createSoftHold(input: {
    scrapId: string;
    saleId: string;
    saleLineId?: string;
    saleLinePieceId?: string;
    heldByEmail: string;
    minutes: number;
    reason?: string;
  }) {
    return this.softHolds.createSoftHold(input);
  }

  async releaseSoftHold(input: { scrapId: string; releasedByEmail: string }) {
    return this.softHolds.releaseSoftHold(input);
  }

  async getActiveSoftHold(scrapId: string) {
    return this.softHolds.getActiveSoftHold(scrapId);
  }

  async releaseSoftHoldsByCriteria(input: {
    releasedByEmail: string;
    saleId?: string;
    saleLineId?: string;
    saleLinePieceIds?: string[];
    holdIds?: string[];
  }) {
    return this.softHolds.releaseSoftHoldsByCriteria(input);
  }

  async generateCutSheet(input: { saleId: string; requestedByEmail: string; reserveSuggestedScraps: boolean }) {
    return this.cutOperations.generateCutSheet(input);
  }
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function parseScrapStatus(value?: string): ScrapStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  const allowed: ScrapStatus[] = [
    ScrapStatus.PENDING_CLASSIFICATION,
    ScrapStatus.DISCARDED,
    ScrapStatus.PENDING_STORAGE,
    ScrapStatus.PENDING_INBOUND,
    ScrapStatus.STORED,
    ScrapStatus.USED
  ];
  return allowed.includes(normalized as ScrapStatus) ? (normalized as ScrapStatus) : undefined;
}

function buildScrapRuleContext(input: {
  scrapWidthM: number;
  scrapHeightM: number;
  skuWidthM: number;
  skuLengthM: number;
  skuThicknessM: number;
}): ScrapRuleContext {
  const scrapWidthCm = round3(input.scrapWidthM * 100);
  const scrapHeightCm = round3(input.scrapHeightM * 100);
  return {
    scrap_width_cm: scrapWidthCm,
    scrap_height_cm: scrapHeightCm,
    scrap_area_cm2: round3(scrapWidthCm * scrapHeightCm),
    sku_width_cm: round3(input.skuWidthM * 100),
    sku_length_cm: round3(input.skuLengthM * 100),
    sku_thickness_cm: round3(input.skuThicknessM * 100)
  };
}
