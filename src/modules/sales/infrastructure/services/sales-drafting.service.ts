import { Injectable } from "@nestjs/common";
import { AuditAction, DiscountSource, PriceMethod, Prisma, PrismaClient, SaleStatus } from "@prisma/client";
import { AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaCustomerDiscountsRepository } from "../../../customers/infrastructure/persistence/prisma/prisma-customer-discounts.repository";
import { SalesLineSupportService } from "./sales-line-support.service";

@Injectable()
export class SalesDraftingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository,
    private readonly customerDiscountsRepo: PrismaCustomerDiscountsRepository,
    private readonly lineSupport: SalesLineSupportService
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
    const { branch, user, priceList } = await this.resolveDraftContext(input);
    const { customer, discount } = await this.resolveCustomerAndDiscount({
      branchId: branch.id,
      customerId: input.customerId ?? null,
      manualDiscountPct: input.manualDiscountPct
    });

    const quoteNumber = await this.prisma.$transaction(async (tx) => getNextDocumentNumberTx(tx, branch.id));

    const sale = await this.prisma.sale.create({
      data: {
        branchId: branch.id,
        createdBy: user.id,
        quoteNumber,
        customerId: customer?.id ?? null,
        customerName: customer?.fullName ?? input.customerName,
        customerReference: customer?.companyOrReference ?? input.customerReference,
        status: SaleStatus.DRAFT,
        priceListId: priceList.id,
        currencyCode: priceList.currencyCode,
        manualDiscountPct: this.normalizeDiscount(input.manualDiscountPct),
        manualDiscountReason: input.manualDiscountReason?.trim() || null,
        discountSource: discount.source,
        discountCodeApplied: discount.code,
        discountPctApplied: discount.pct,
        subtotalAmount: 0,
        taxAmount: 0,
        totalAmount: 0
      }
    });

    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: user.id,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.CREATE,
      afterJson: { status: sale.status, priceListId: sale.priceListId, quoteNumber: sale.quoteNumber }
    });

    return sale;
  }

  async createFromQuote(input: {
    quoteBatchId?: string;
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
    const { branch, user, priceList } = await this.resolveDraftContext(input);
    const { customer, discount } = await this.resolveCustomerAndDiscount({
      branchId: branch.id,
      customerId: input.customerId ?? null,
      manualDiscountPct: input.manualDiscountPct
    });

    type LineData = {
      skuId: string;
      categoryId: string | null;
      displayOrder: number;
      lineNote: string | null;
      roomAreaName: string | null;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
      priceMethod: PriceMethod;
      unitPrice: number;
      discountPct: number;
      lineSubtotal: number;
      lineTotal: number;
    };

    const lineErrors: Array<{ index: number; error: string }> = [];
    const lineDataList: LineData[] = [];
    const saleContext = {
      branchId: branch.id,
      priceListId: priceList.id,
      discountPctApplied: discount.pct
    };

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      try {
        const lineData = await this.lineSupport.resolveLineData(saleContext, {
          skuCode: item.skuCode,
          requestedWidthM: item.requestedWidthM,
          requestedHeightM: item.requestedHeightM,
          quantity: item.quantity,
          roomAreaName: item.roomAreaName ?? item.categoryName ?? null,
          categoryId: item.categoryId ?? null,
          categoryName: item.categoryName ?? null,
          displayOrder: item.displayOrder ?? i,
          lineNote: item.lineNote ?? null,
          actorEmail: input.createdByEmail
        });
        lineDataList.push(lineData);
      } catch (err) {
        lineErrors.push({ index: i, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    if (lineErrors.length > 0) {
      throw Object.assign(new Error("Some items are invalid"), { lineErrors, isValidationError: true });
    }

    const linesSubtotal = round2(lineDataList.reduce((acc, l) => acc + l.lineTotal, 0));
    const commercialAdjPct = Math.min(Math.max(input.commercialAdjustmentPct ?? 0, 0), 100);
    const commercialAdj = round2(linesSubtotal * (commercialAdjPct / 100));
    const installation = Math.max(input.installationAmount ?? 0, 0);
    const subtotalAmount = round2(linesSubtotal + commercialAdj + installation);
    const taxAmount = round2(subtotalAmount * 0.19);
    const totalAmount = roundClpCash(subtotalAmount + taxAmount);

    const sale = await this.prisma.$transaction(async (tx) => {
      let quoteNumber = await getNextDocumentNumberTx(tx, branch.id);

      if (input.quoteBatchId) {
        const quoteBatch = await tx.quoteBatch.findFirst({
          where: { id: input.quoteBatchId, branchId: branch.id },
          select: { quoteNumber: true, priceListId: true }
        });
        if (!quoteBatch) {
          throw new AppNotFoundError("La cotización origen no fue encontrada.");
        }
        if (quoteBatch.priceListId !== priceList.id) {
          throw new AppValidationError("La cotización origen no coincide con la lista de precios seleccionada.");
        }
        quoteNumber = quoteBatch.quoteNumber;

        const conflictingSale = await tx.sale.findFirst({
          where: { branchId: branch.id, quoteNumber },
          select: { id: true }
        });

        if (conflictingSale || quoteNumber <= 0) {
          quoteNumber = await getNextDocumentNumberTx(tx, branch.id);
          await tx.quoteBatch.update({
            where: { id: input.quoteBatchId },
            data: { quoteNumber }
          });
        }
      }

      const saleAmountPaid = Math.max(input.amountPaid ?? 0, 0);
      const saleBalanceDue = Math.max(totalAmount - saleAmountPaid, 0);

      const newSale = await tx.sale.create({
        data: {
          branchId: branch.id,
          createdBy: user.id,
          quoteNumber,
          customerId: customer?.id ?? null,
          customerName: customer?.fullName ?? input.customerName,
          customerReference: customer?.companyOrReference ?? input.customerReference,
          status: SaleStatus.DRAFT,
          priceListId: priceList.id,
          currencyCode: priceList.currencyCode,
          manualDiscountPct: this.normalizeDiscount(input.manualDiscountPct),
          manualDiscountReason: input.manualDiscountReason?.trim() || null,
          discountSource: discount.source,
          discountCodeApplied: discount.code,
          discountPctApplied: discount.pct,
          commercialAdjustmentPct: commercialAdjPct,
          commercialAdjustmentAmount: commercialAdj,
          installationAmount: installation,
          subtotalAmount,
          taxAmount,
          totalAmount,
          amountPaid: saleAmountPaid,
          balanceDue: saleBalanceDue
        }
      });

      for (const lineData of lineDataList) {
        const createdLine = await tx.saleLine.create({
          data: {
            saleId: newSale.id,
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
        await createSaleLinePiecesTx(tx, createdLine.id, {
          quantity: lineData.quantity,
          requestedWidthM: lineData.requestedWidthM,
          requestedHeightM: lineData.requestedHeightM,
          roomAreaName: lineData.roomAreaName
        });
      }

      return newSale;
    });

    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: user.id,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.CREATE,
      afterJson: {
        status: sale.status,
        priceListId: sale.priceListId,
        quoteNumber: sale.quoteNumber,
        linesCreated: lineDataList.length,
        totalAmount
      }
    });

    return { sale, linesCreated: lineDataList.length, subtotalAmount, taxAmount, totalAmount };
  }

  async resolveCustomerAndDiscount(input: {
    branchId: string;
    customerId?: string | null;
    manualDiscountPct?: number | null;
    skipActiveCheck?: boolean;
  }) {
    const customer = input.customerId
      ? input.skipActiveCheck
        ? await this.prisma.customer.findUnique({ where: { id: input.customerId } })
        : await this.prisma.customer.findFirst({
            where: { id: input.customerId, branchId: input.branchId, isActive: true }
          })
      : null;
    if (input.customerId && !customer) throw new AppNotFoundError("Cliente no encontrado.");

    const temporalDiscount = customer
      ? await this.customerDiscountsRepo.findActiveForDate(customer.id, new Date())
      : null;

    const discount = this.resolveDiscount({
      manualDiscountPct: input.manualDiscountPct,
      temporalDiscount: temporalDiscount
        ? { discountCode: temporalDiscount.discountCode, discountPct: Number(temporalDiscount.discountPct) }
        : null,
      customerDiscountCode: customer?.discountCode ?? null,
      customerDiscountPct: customer ? Number(customer.discountPct) : 0
    });

    return { customer, discount };
  }

  normalizeDiscount(value?: number | null) {
    const discount = Number(value ?? 0);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      throw new AppValidationError("El descuento debe estar entre 0 y 100.");
    }
    return round2(discount);
  }

  resolveDiscount(input: {
    manualDiscountPct?: number | null;
    temporalDiscount?: { discountCode: string | null; discountPct: number } | null;
    customerDiscountCode?: string | null;
    customerDiscountPct?: number;
  }) {
    const manualDiscountPct = this.normalizeDiscount(input.manualDiscountPct);
    if (manualDiscountPct > 0) {
      return { source: DiscountSource.MANUAL, code: null, pct: manualDiscountPct };
    }
    if (input.temporalDiscount && input.temporalDiscount.discountPct > 0) {
      return {
        source: DiscountSource.CUSTOMER_CODE,
        code: input.temporalDiscount.discountCode,
        pct: this.normalizeDiscount(input.temporalDiscount.discountPct)
      };
    }
    const customerDiscountPct = this.normalizeDiscount(input.customerDiscountPct);
    if (customerDiscountPct > 0 && input.customerDiscountCode) {
      return {
        source: DiscountSource.CUSTOMER_CODE,
        code: input.customerDiscountCode,
        pct: customerDiscountPct
      };
    }
    return { source: DiscountSource.NONE, code: null, pct: 0 };
  }

  private async resolveDraftContext(input: { branchCode: string; createdByEmail: string; priceListName: string }) {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    const user = await this.prisma.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !user) throw new AppNotFoundError("Sucursal o usuario no encontrado.");

    const priceList = await this.prisma.priceList.findFirst({
      where: { branchId: branch.id, name: input.priceListName, isActive: true }
    });
    if (!priceList) throw new AppNotFoundError("Lista de precios no encontrada.");

    return { branch, user, priceList };
  }
}

async function getNextDocumentNumberTx(
  tx: Prisma.TransactionClient,
  branchId: string
) {
  const [lastSale, lastBatch] = await Promise.all([
    tx.sale.findFirst({
      where: { branchId },
      orderBy: { quoteNumber: "desc" },
      select: { quoteNumber: true }
    }),
    tx.quoteBatch.findFirst({
      where: { branchId },
      orderBy: { quoteNumber: "desc" },
      select: { quoteNumber: true }
    })
  ]);

  return Math.max(lastSale?.quoteNumber ?? 0, lastBatch?.quoteNumber ?? 0) + 1;
}

type SaleLinePiecesTx = Pick<PrismaClient, "saleLinePiece">;

async function createSaleLinePiecesTx(
  tx: SaleLinePiecesTx,
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

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function roundClpCash(value: number): number {
  const integer = Math.round(value);
  const remainder = integer % 10;
  const base = integer - remainder;
  return remainder <= 5 ? base : base + 10;
}
