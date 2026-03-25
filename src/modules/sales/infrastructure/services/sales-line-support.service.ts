import { Injectable } from "@nestjs/common";
import { PriceMethod, PrismaClient, SaleStatus, SoftHoldStatus } from "@prisma/client";
import { AppConflictError, AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { PrismaQuoteItemCategoriesRepository } from "../../../quote-item-categories/infrastructure/persistence/prisma/prisma-quote-item-categories.repository";

@Injectable()
export class SalesLineSupportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly categoriesRepo: PrismaQuoteItemCategoriesRepository
  ) {}

  async resolveLineData(
    sale: { branchId: string; priceListId: string; discountPctApplied: number | { toString(): string } },
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
      actorEmail?: string;
    }
  ) {
    const sku = await this.prisma.fabricSku.findFirst({
      where: { branchId: sale.branchId, code: input.skuCode, isActive: true }
    });
    if (!sku) throw new AppNotFoundError("SKU no encontrado.");

    const skuWidthM = Number(sku.widthValue);
    if (input.requestedWidthM > skuWidthM) throw new AppValidationError("El ancho solicitado supera el ancho del SKU.");

    const priceItem = await this.prisma.priceListItem.findFirst({
      where: { priceListId: sale.priceListId, skuId: sku.id }
    });
    if (!priceItem) throw new AppNotFoundError("Precio no encontrado para el SKU.");

    const cell = await this.prisma.priceListCell.findFirst({
      where: {
        priceListId: sale.priceListId,
        skuId: sku.id,
        maxWidthM: { gte: input.requestedWidthM },
        maxHeightM: { gte: input.requestedHeightM }
      },
      orderBy: [{ maxWidthM: "asc" }, { maxHeightM: "asc" }]
    });

    const priceMethod = cell ? PriceMethod.TABLE_LOOKUP : PriceMethod.LINEAR_METER;
    const unitPrice = cell ? Number(cell.unitPrice) : Number(priceItem.basePrice);
    const discountPct = Number(sale.discountPctApplied);
    const amounts = computeLineAmounts({
      priceMethod,
      requestedHeightM: input.requestedHeightM,
      quantity: input.quantity,
      unitPrice,
      discountPct
    });

    let resolvedCategoryId: string | null = null;
    if (input.categoryId) {
      resolvedCategoryId = input.categoryId;
    } else if (input.categoryName && input.actorEmail) {
      const category = await this.categoriesRepo.findOrCreate({
        branchId: sale.branchId,
        name: input.categoryName,
        createdByEmail: input.actorEmail
      });
      resolvedCategoryId = category.id;
    }

    return {
      skuId: sku.id,
      categoryId: resolvedCategoryId,
      displayOrder: input.displayOrder ?? 0,
      lineNote: input.lineNote?.trim() || null,
      roomAreaName: input.roomAreaName?.trim() || null,
      requestedWidthM: input.requestedWidthM,
      requestedHeightM: input.requestedHeightM,
      quantity: input.quantity,
      priceMethod,
      unitPrice,
      discountPct,
      lineSubtotal: amounts.lineSubtotal,
      lineTotal: amounts.lineTotal
    };
  }

  async getEditableDraftLine(saleId: string, saleLineId: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");
    if (sale.status !== SaleStatus.DRAFT) throw new AppValidationError("Solo se pueden editar líneas de ventas en estado DRAFT.");

    const line = await this.prisma.saleLine.findFirst({ where: { id: saleLineId, saleId } });
    if (!line) throw new AppNotFoundError("Línea de venta no encontrada.");

    const activeAllocation = await this.prisma.saleLineScrapAllocation.findFirst({
      where: { saleLineId: line.id, isActive: true }
    });
    if (activeAllocation) throw new AppConflictError("No se puede editar esta línea porque tiene un retazo asignado.");

    const cutJob = await this.prisma.cutJob.findFirst({ where: { saleLineId: line.id } });
    if (cutJob) throw new AppConflictError("No se puede editar esta línea porque ya tiene trabajo de corte asociado.");

    const activeSoftHold = await this.prisma.scrapSoftHold.findFirst({
      where: { saleLineId: line.id, status: SoftHoldStatus.ACTIVE, releasedAt: null, convertedAt: null }
    });
    if (activeSoftHold) throw new AppConflictError("No se puede editar esta línea porque tiene una reserva temporal activa.");

    return { sale, line };
  }
}

export function computeLineAmounts(input: {
  priceMethod: PriceMethod;
  requestedHeightM: number;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}) {
  const grossSubtotal =
    input.priceMethod === PriceMethod.TABLE_LOOKUP
      ? round2(input.unitPrice * input.quantity)
      : round2(input.requestedHeightM * input.quantity * input.unitPrice);
  const lineTotal = round2(grossSubtotal * (1 - input.discountPct / 100));

  return {
    lineSubtotal: grossSubtotal,
    lineTotal
  };
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
