import { AuditAction, CutJobStatus, PriceMethod, SaleStatus, ScrapStatus } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

export class PrismaSalesRepository {
  private readonly auditRepo = new PrismaAuditRepository();

  async createDraft(input: {
    branchCode: string;
    createdByEmail: string;
    priceListName: string;
    customerName?: string;
    customerReference?: string;
  }) {
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    const createdBy = await prismaClient.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !createdBy) throw new Error("Branch/user not found.");

    const priceList = await prismaClient.priceList.findFirst({
      where: { branchId: branch.id, name: input.priceListName, isActive: true }
    });
    if (!priceList) throw new Error("Price list not found.");

    const sale = await prismaClient.sale.create({
      data: {
        branchId: branch.id,
        createdBy: createdBy.id,
        customerName: input.customerName,
        customerReference: input.customerReference,
        status: SaleStatus.DRAFT,
        priceListId: priceList.id,
        currencyCode: priceList.currencyCode,
        subtotalAmount: 0,
        taxAmount: 0,
        totalAmount: 0
      }
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: createdBy.id,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.CREATE,
      afterJson: { status: sale.status, priceListId: sale.priceListId }
    });

    return sale;
  }

  async addLine(saleId: string, input: { skuCode: string; requestedWidthM: number; requestedHeightM: number; quantity: number }) {
    const sale = await prismaClient.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Sale not found.");
    if (sale.status !== SaleStatus.DRAFT) throw new Error("Only DRAFT sale can receive lines.");

    const sku = await prismaClient.fabricSku.findFirst({
      where: { branchId: sale.branchId, code: input.skuCode, isActive: true }
    });
    if (!sku) throw new Error("SKU not found.");

    const skuWidthM = Number(sku.widthValue);
    if (input.requestedWidthM > skuWidthM) throw new Error("Requested width exceeds SKU width.");

    const priceItem = await prismaClient.priceListItem.findFirst({
      where: { priceListId: sale.priceListId, skuId: sku.id }
    });
    if (!priceItem) throw new Error("Price not found for SKU.");

    const unitPrice = Number(priceItem.basePrice);
    const linearMeters = input.requestedHeightM * input.quantity;
    const lineSubtotal = round2(linearMeters * unitPrice);
    const lineTotal = lineSubtotal;

    const line = await prismaClient.saleLine.create({
      data: {
        saleId: sale.id,
        skuId: sku.id,
        requestedWidthM: input.requestedWidthM,
        requestedHeightM: input.requestedHeightM,
        quantity: input.quantity,
        priceMethod: PriceMethod.LINEAR_METER,
        unitPrice,
        discountPct: 0,
        lineSubtotal,
        lineTotal
      }
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: sale.createdBy,
      entityType: "sale_line",
      entityId: line.id,
      action: AuditAction.CREATE,
      afterJson: {
        saleId: sale.id,
        skuId: sku.id,
        quantity: input.quantity,
        lineTotal
      }
    });

    await this.recomputeTotals(sale.id);
  }

  async recomputeTotals(saleId: string) {
    const lines = await prismaClient.saleLine.findMany({ where: { saleId } });
    const subtotal = round2(lines.reduce((acc, line) => acc + Number(line.lineTotal), 0));
    const tax = round2(subtotal * 0.19);
    const total = roundClpCash(subtotal + tax);

    await prismaClient.sale.update({
      where: { id: saleId },
      data: {
        subtotalAmount: subtotal,
        taxAmount: tax,
        totalAmount: total
      }
    });
  }

  async confirm(saleId: string, rules?: { scrapRequiredAtStage?: string }) {
    const sale = await prismaClient.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: {
          include: { allocations: { where: { isActive: true }, select: { id: true, scrapId: true } } }
        }
      }
    });
    if (!sale) throw new Error("Sale not found.");
    if (sale.status !== SaleStatus.DRAFT) throw new Error("Only DRAFT sale can be confirmed.");
    if (sale.lines.length === 0) throw new Error("Sale without lines cannot be confirmed.");

    if (rules?.scrapRequiredAtStage === "AT_SALE_CLOSE") {
      const lineIds = sale.lines.map((l) => l.id);
      const pendingScrap = await prismaClient.scrap.findFirst({
        where: { saleLineId: { in: lineIds }, status: ScrapStatus.PENDING_STORAGE }
      });
      if (pendingScrap) {
        throw new Error("Existen retazos pendientes de almacenamiento. Asigne ubicacion antes de confirmar la venta.");
      }
    }

    await prismaClient.$transaction(async (tx) => {
      await tx.sale.update({ where: { id: sale.id }, data: { status: SaleStatus.CONFIRMED } });
      for (const line of sale.lines) {
        const allocation = line.allocations[0];
        if (allocation) {
          await tx.scrap.update({ where: { id: allocation.scrapId }, data: { status: ScrapStatus.USED } });
        } else {
          const exists = await tx.cutJob.findFirst({ where: { saleLineId: line.id } });
          if (!exists) {
            await tx.cutJob.create({ data: { saleLineId: line.id, status: "PENDING" } });
          }
        }
      }
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: sale.createdBy,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: sale.status },
      afterJson: { status: SaleStatus.CONFIRMED }
    });
  }

  async cancel(saleId: string, canceledReason?: string) {
    const sale = await prismaClient.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: {
          include: { allocations: { where: { isActive: true }, select: { id: true, scrapId: true } } }
        }
      }
    });
    if (!sale) throw new Error("Sale not found.");

    const lineIds = sale.lines.map((line) => line.id);
    if (lineIds.length > 0) {
      const blocked = await prismaClient.cutJob.findFirst({
        where: { saleLineId: { in: lineIds }, status: { in: ["CUT", "DELIVERED"] } }
      });
      if (blocked) throw new Error("Sale cannot be canceled because cut was already executed.");
    }

    await prismaClient.$transaction(async (tx) => {
      for (const line of sale.lines) {
        const allocation = line.allocations[0];
        if (allocation) {
          const scrap = await tx.scrap.findUnique({ where: { id: allocation.scrapId } });
          if (scrap?.status === ScrapStatus.USED) {
            await tx.scrap.update({ where: { id: allocation.scrapId }, data: { status: ScrapStatus.STORED } });
          }
          await tx.saleLineScrapAllocation.update({
            where: { id: allocation.id },
            data: { isActive: false, releasedAt: new Date() }
          });
        }
      }
      await tx.sale.update({ where: { id: sale.id }, data: { status: SaleStatus.CANCELED, canceledReason } });
    });

    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: sale.createdBy,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: sale.status },
      afterJson: { status: SaleStatus.CANCELED, canceledReason: canceledReason ?? null }
    });
  }

  async list(branchCode: string) {
    return prismaClient.sale.findMany({
      where: { branch: { code: branchCode } },
      include: {
        lines: {
          include: {
            sku: { select: { code: true } },
            allocations: { where: { isActive: true }, select: { scrapId: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async markCut(cutJobId: string, cutByEmail: string) {
    const user = await prismaClient.appUser.findUnique({ where: { email: cutByEmail } });
    if (!user) throw new Error("Cut operator not found.");

    const current = await prismaClient.cutJob.findUnique({ where: { id: cutJobId } });
    if (!current) throw new Error("Cut job not found.");
    if (current.status !== CutJobStatus.PENDING && current.status !== CutJobStatus.IN_PROGRESS) {
      throw new Error("Cut job cannot be marked CUT from current status.");
    }

    const cutJob = await prismaClient.cutJob.update({
      where: { id: cutJobId },
      data: {
        status: CutJobStatus.CUT,
        cutBy: user.id,
        cutAt: new Date()
      },
      include: {
        saleLine: {
          include: {
            sku: { include: { widthUnit: true, lengthUnit: true } },
            sale: { select: { branchId: true } }
          }
        }
      }
    });
    await this.auditRepo.log({
      actorUserId: user.id,
      entityType: "cut_job",
      entityId: cutJob.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: "PENDING|IN_PROGRESS" },
      afterJson: { status: "CUT", cutAt: cutJob.cutAt?.toISOString() ?? null }
    });
    return cutJob;
  }

  async listCutJobs(params: { saleId?: string; branchCode?: string; status?: CutJobStatus }) {
    return prismaClient.cutJob.findMany({
      where: {
        status: params.status,
        saleLine: {
          saleId: params.saleId,
          sale: params.branchCode ? { branch: { code: params.branchCode } } : undefined
        }
      },
      include: {
        saleLine: {
          include: {
            sku: { select: { code: true, name: true } },
            sale: { select: { id: true, createdAt: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function roundClpCash(value: number): number {
  const integer = Math.round(value);
  const remainder = integer % 10;
  const base = integer - remainder;
  return remainder <= 5 ? base : base + 10;
}
