import { Injectable } from "@nestjs/common";
import { AuditAction, CutJobStatus, PrismaClient, SaleStatus } from "@prisma/client";
import { AppNotFoundError, AppValidationError } from "../../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { SalesCutJobsService } from "../../services/sales-cut-jobs.service";
import { computeLineAmounts, SalesLineSupportService } from "../../services/sales-line-support.service";
import { SalesDraftingService } from "../../services/sales-drafting.service";
import { SalesLifecycleService } from "../../services/sales-lifecycle.service";

@Injectable()
export class PrismaSalesRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository,
    private readonly cutJobs: SalesCutJobsService,
    private readonly lineSupport: SalesLineSupportService,
    private readonly drafting: SalesDraftingService,
    private readonly lifecycle: SalesLifecycleService
  ) {}

  async createDraft(input: {
    branchCode: string;
    createdByEmail: string;
    priceListName: string;
    customerId?: string;
    customerName?: string;
    customerReference?: string;
    manualDiscountPct?: number;
    manualDiscountReason?: string;
  }) {
    return this.drafting.createDraft(input);
  }

  async addLine(saleId: string, input: {
    skuCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    quantity: number;
    roomAreaName?: string;
    categoryId?: string;
    categoryName?: string;
    displayOrder?: number;
    lineNote?: string;
    createdByEmail?: string;
  }) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");
    if (sale.status !== SaleStatus.DRAFT) throw new AppValidationError("Solo se pueden agregar líneas a ventas en estado DRAFT.");
    const lineData = await this.lineSupport.resolveLineData(sale, {
      skuCode: input.skuCode,
      requestedWidthM: input.requestedWidthM,
      requestedHeightM: input.requestedHeightM,
      quantity: input.quantity,
      roomAreaName: input.roomAreaName ?? input.categoryName ?? null,
      categoryId: input.categoryId ?? null,
      categoryName: input.categoryName ?? null,
      displayOrder: input.displayOrder ?? 0,
      lineNote: input.lineNote ?? null,
      actorEmail: input.createdByEmail
    });

    const line = await this.prisma.saleLine.create({
      data: {
        saleId: sale.id,
        skuId: lineData.skuId,
        categoryId: lineData.categoryId,
        displayOrder: lineData.displayOrder,
        lineNote: lineData.lineNote,
        roomAreaName: lineData.roomAreaName,
        requestedWidthM: lineData.requestedWidthM,
        requestedHeightM: lineData.requestedHeightM,
        quantity: lineData.quantity,
        priceMethod: lineData.priceMethod,
        unitPrice: lineData.unitPrice,
        discountPct: lineData.discountPct,
        lineSubtotal: lineData.lineSubtotal,
        lineTotal: lineData.lineTotal
      }
    });
    await this.createSaleLinePieces(line.id, {
      quantity: lineData.quantity,
      requestedWidthM: lineData.requestedWidthM,
      requestedHeightM: lineData.requestedHeightM,
      roomAreaName: lineData.roomAreaName
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: sale.createdBy,
      entityType: "sale_line",
      entityId: line.id,
      action: AuditAction.CREATE,
      afterJson: {
        saleId: sale.id,
        skuId: lineData.skuId,
        quantity: lineData.quantity,
        lineTotal: lineData.lineTotal,
        categoryId: lineData.categoryId,
        displayOrder: lineData.displayOrder,
        roomAreaName: lineData.roomAreaName
      }
    });

    await this.recomputeTotals(sale.id);
  }

  async updateLine(
    saleId: string,
    saleLineId: string,
    updatedByEmail: string,
    input: {
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
      roomAreaName?: string | null;
      categoryId?: string | null;
      categoryName?: string | null;
      displayOrder?: number;
      lineNote?: string | null;
    }
  ) {
    const { sale, line } = await this.lineSupport.getEditableDraftLine(saleId, saleLineId);
    const user = await this.prisma.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const lineData = await this.lineSupport.resolveLineData(sale, {
      skuCode: input.skuCode,
      requestedWidthM: input.requestedWidthM,
      requestedHeightM: input.requestedHeightM,
      quantity: input.quantity,
      roomAreaName: input.roomAreaName ?? null,
      categoryId: input.categoryId ?? null,
      categoryName: input.categoryName ?? null,
      displayOrder: input.displayOrder ?? line.displayOrder,
      lineNote: input.lineNote ?? null,
      actorEmail: updatedByEmail
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.saleLine.update({
        where: { id: line.id },
        data: {
          skuId: lineData.skuId,
          categoryId: lineData.categoryId,
          displayOrder: lineData.displayOrder,
          lineNote: lineData.lineNote,
          roomAreaName: lineData.roomAreaName,
          requestedWidthM: lineData.requestedWidthM,
          requestedHeightM: lineData.requestedHeightM,
          quantity: lineData.quantity,
          priceMethod: lineData.priceMethod,
          unitPrice: lineData.unitPrice,
          discountPct: lineData.discountPct,
          lineSubtotal: lineData.lineSubtotal,
          lineTotal: lineData.lineTotal
        }
      });
      await tx.saleLinePiece.deleteMany({ where: { saleLineId: line.id } });
      await createSaleLinePiecesTx(tx, line.id, {
        quantity: lineData.quantity,
        requestedWidthM: lineData.requestedWidthM,
        requestedHeightM: lineData.requestedHeightM,
        roomAreaName: lineData.roomAreaName
      });
      await this.recomputeTotals(sale.id, tx);
    });

    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: user.id,
      entityType: "sale_line",
      entityId: line.id,
      action: AuditAction.UPDATE,
      beforeJson: {
        skuId: line.skuId,
        categoryId: line.categoryId,
        displayOrder: line.displayOrder,
        lineNote: line.lineNote,
        roomAreaName: line.roomAreaName,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        quantity: line.quantity,
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal)
      },
      afterJson: {
        skuId: lineData.skuId,
        categoryId: lineData.categoryId,
        displayOrder: lineData.displayOrder,
        lineNote: lineData.lineNote,
        roomAreaName: lineData.roomAreaName,
        requestedWidthM: lineData.requestedWidthM,
        requestedHeightM: lineData.requestedHeightM,
        quantity: lineData.quantity,
        unitPrice: lineData.unitPrice,
        lineTotal: lineData.lineTotal
      }
    });
  }

  async removeLine(saleId: string, saleLineId: string, removedByEmail: string) {
    const { sale, line } = await this.lineSupport.getEditableDraftLine(saleId, saleLineId);
    const user = await this.prisma.appUser.findUnique({ where: { email: removedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    await this.prisma.$transaction(async (tx) => {
      await tx.saleLinePiece.deleteMany({ where: { saleLineId: line.id } });
      await tx.saleLine.delete({ where: { id: line.id } });
      await this.recomputeTotals(sale.id, tx);
    });

    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: user.id,
      entityType: "sale_line",
      entityId: line.id,
      action: AuditAction.DELETE,
      beforeJson: {
        saleId: sale.id,
        skuId: line.skuId,
        categoryId: line.categoryId,
        displayOrder: line.displayOrder,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        quantity: line.quantity,
        lineTotal: Number(line.lineTotal)
      }
    });
  }

  async updateCustomer(
    saleId: string,
    updatedByEmail: string,
    input: {
      customerId?: string | null;
      customerName?: string | null;
      customerReference?: string | null;
      manualDiscountPct?: number | null;
      manualDiscountReason?: string | null;
    }
  ) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");
    if (sale.status !== "DRAFT") throw new AppValidationError("Solo se puede editar el cliente en ventas en estado DRAFT.");
    const user = await this.prisma.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");
    const manualDiscountPct =
      input.manualDiscountPct === undefined || input.manualDiscountPct === null
        ? Number(sale.manualDiscountPct)
        : input.manualDiscountPct;
    const selectedCustomerId = input.customerId === undefined ? sale.customerId : input.customerId;
    const { customer, discount } = await this.drafting.resolveCustomerAndDiscount({
      branchId: sale.branchId,
      customerId: selectedCustomerId ?? null,
      manualDiscountPct,
      skipActiveCheck: input.customerId === undefined
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: saleId },
        data: {
          customerId: input.customerId === undefined ? sale.customerId : customer?.id ?? null,
          customerName: customer?.fullName ?? input.customerName ?? sale.customerName,
          customerReference: customer?.companyOrReference ?? input.customerReference ?? sale.customerReference,
          manualDiscountPct: this.drafting.normalizeDiscount(manualDiscountPct),
          manualDiscountReason:
            input.manualDiscountReason === undefined ? sale.manualDiscountReason : input.manualDiscountReason?.trim() || null,
          discountSource: discount.source,
          discountCodeApplied: discount.code,
          discountPctApplied: discount.pct
        }
      });
      await this.refreshLineDiscounts(tx, saleId, discount.pct);
      await this.recomputeTotals(saleId, tx);
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: user.id,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.UPDATE,
      beforeJson: {
        customerId: sale.customerId,
        customerName: sale.customerName,
        customerReference: sale.customerReference,
        manualDiscountPct: Number(sale.manualDiscountPct),
        discountSource: sale.discountSource,
        discountCodeApplied: sale.discountCodeApplied,
        discountPctApplied: Number(sale.discountPctApplied)
      },
      afterJson: {
        customerId: customer?.id ?? null,
        customerName: customer?.fullName ?? input.customerName ?? sale.customerName,
        customerReference: customer?.companyOrReference ?? input.customerReference ?? sale.customerReference,
        manualDiscountPct: this.drafting.normalizeDiscount(manualDiscountPct),
        discountSource: discount.source,
        discountCodeApplied: discount.code,
        discountPctApplied: discount.pct
      }
    });
  }

  async updatePaymentSummary(saleId: string, amountPaid: number) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");
    const balanceDue = Math.max(Number(sale.totalAmount) - amountPaid, 0);
    await this.prisma.sale.update({
      where: { id: saleId },
      data: { amountPaid, balanceDue }
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: sale.createdBy,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.UPDATE,
      beforeJson: { amountPaid: Number(sale.amountPaid) },
      afterJson: { amountPaid, balanceDue }
    });
  }

  async recomputeTotals(saleId: string, tx: MinimalSalesTx = this.prisma) {
    await this.lifecycle.recomputeTotals(saleId, tx);
  }

  async confirm(saleId: string) {
    await this.lifecycle.confirm(saleId);
  }

  async cancel(saleId: string, canceledReason?: string) {
    await this.lifecycle.cancel(saleId, canceledReason);
  }

  async createFromQuote(input: {
    branchCode: string;
    createdByEmail: string;
    priceListName: string;
    customerId?: string;
    customerName?: string;
    customerReference?: string;
    manualDiscountPct?: number;
    manualDiscountReason?: string;
    amountPaid?: number;
    commercialAdjustmentPct?: number;
    installationAmount?: number;
    items: Array<{
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
      roomAreaName?: string;
      categoryId?: string;
      categoryName?: string;
      displayOrder?: number;
      lineNote?: string;
    }>;
  }) {
    return this.drafting.createFromQuote(input);
  }

  async list(branchCode: string) {
    return this.prisma.sale.findMany({
      where: { branch: { code: branchCode } },
      include: {
        customer: { select: { id: true, code: true, fullName: true, phone: true, email: true, companyOrReference: true, discountCode: true } },
        lines: {
          include: {
            sku: { select: { code: true } },
            category: { select: { name: true } },
            pieces: {
              include: {
                allocations: {
                  where: { isActive: true },
                  include: { scrap: { include: { location: true } } }
                }
              },
              orderBy: { pieceIndex: "asc" }
            }
          },
          orderBy: { displayOrder: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async getPrintableSale(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        branch: true,
        customer: true,
        priceList: true,
        lines: {
          include: {
            sku: true,
            pieces: { orderBy: { pieceIndex: "asc" } }
          },
          orderBy: { displayOrder: "asc" }
        }
      }
    });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");
    return sale;
  }

  async markCut(cutJobId: string, cutByEmail: string) {
    return this.cutJobs.markCut(cutJobId, cutByEmail);
  }

  async listCutJobs(params: { saleId?: string; search?: string; branchCode?: string; status?: CutJobStatus; page?: number; limit?: number }) {
    return this.cutJobs.listCutJobs(params);
  }

  private async createSaleLinePieces(
    saleLineId: string,
    input: { quantity: number; requestedWidthM: number; requestedHeightM: number; roomAreaName: string | null }
  ) {
    await createSaleLinePiecesTx(this.prisma, saleLineId, input);
  }

  private async refreshLineDiscounts(tx: MinimalSalesTx, saleId: string, discountPct: number) {
    const lines = await tx.saleLine.findMany({ where: { saleId } });
    for (const line of lines) {
      const amounts = computeLineAmounts({
        priceMethod: line.priceMethod,
        requestedHeightM: Number(line.requestedHeightM),
        quantity: line.quantity,
        unitPrice: Number(line.unitPrice),
        discountPct
      });
      await tx.saleLine.update({
        where: { id: line.id },
        data: {
          discountPct,
          lineSubtotal: amounts.lineSubtotal,
          lineTotal: amounts.lineTotal
        }
      });
    }
  }
}

async function createSaleLinePiecesTx(
  tx: MinimalSalesTx,
  saleLineId: string,
  input: { quantity: number; requestedWidthM: number; requestedHeightM: number; roomAreaName: string | null }
) {
  if (input.quantity <= 0) return;
  const data = Array.from({ length: input.quantity }, (_, index) => ({
    saleLineId,
    pieceIndex: index + 1,
    pieceTotal: input.quantity,
    requestedWidthM: input.requestedWidthM,
    requestedHeightM: input.requestedHeightM,
    roomAreaName: input.roomAreaName
  }));
  await tx.saleLinePiece.createMany({ data });
}

type MinimalSalesTx = Pick<
  PrismaClient,
  "sale" | "saleLine" | "saleLinePiece"
>;

function round2(value: number): number {
  return Number(value.toFixed(2));
}
