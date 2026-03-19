import { Injectable } from "@nestjs/common";
import { AuditAction, PrismaClient } from "@prisma/client";
import type { PriceRepositoryPort } from "../../../application/ports/price-repository.port";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

@Injectable()
export class PrismaPriceRepository implements PriceRepositoryPort {
  private readonly auditRepo = new PrismaAuditRepository();

  constructor(private readonly prisma: PrismaClient) {}

  async getQuoteContext(params: {
    branchCode: string;
    createdByEmail: string;
    skuCode: string;
    priceListName: string;
  }): Promise<{
    branchId: string;
    createdBy: string;
    skuId: string;
    priceListId: string;
    currencyCode: string;
    skuWidthM: number;
    unitPrice: number;
    discountPct: number;
  } | null> {
    const branch = await this.prisma.branch.findUnique({
      where: { code: params.branchCode },
      select: { id: true }
    });
    if (!branch) return null;

    const user = await this.prisma.appUser.findUnique({
      where: { email: params.createdByEmail },
      select: { id: true }
    });
    if (!user) return null;

    const sku = await this.prisma.fabricSku.findFirst({
      where: { branchId: branch.id, code: params.skuCode, isActive: true },
      select: { id: true, widthValue: true }
    });
    if (!sku) return null;

    const priceList = await this.prisma.priceList.findFirst({
      where: {
        branchId: branch.id,
        name: params.priceListName,
        isActive: true
      },
      select: { id: true, currencyCode: true }
    });
    if (!priceList) return null;

    const item = await this.prisma.priceListItem.findFirst({
      where: {
        priceListId: priceList.id,
        skuId: sku.id
      },
      select: {
        basePrice: true,
        discountPct: true
      }
    });
    if (!item) return null;

    return {
      branchId: branch.id,
      createdBy: user.id,
      skuId: sku.id,
      priceListId: priceList.id,
      currencyCode: priceList.currencyCode,
      skuWidthM: Number(sku.widthValue),
      unitPrice: Number(item.basePrice),
      discountPct: Number(item.discountPct)
    };
  }

  async saveQuote(params: {
    branchId: string;
    createdBy: string;
    skuId: string;
    priceListId: string;
    currencyCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    quantity: number;
    unitPrice: number;
    linearMeters: number;
    subtotalAmount: number;
    totalRounded: number;
    createdAt: Date;
  }): Promise<{ quoteId: string }> {
    const quote = await this.prisma.quote.create({
      data: {
        branchId: params.branchId,
        createdBy: params.createdBy,
        skuId: params.skuId,
        priceListId: params.priceListId,
        currencyCode: params.currencyCode,
        requestedWidthM: params.requestedWidthM,
        requestedHeightM: params.requestedHeightM,
        quantity: params.quantity,
        unitPrice: params.unitPrice,
        linearMeters: params.linearMeters,
        subtotalAmount: params.subtotalAmount,
        totalRounded: params.totalRounded,
        createdAt: params.createdAt
      },
      select: { id: true }
    });
    await this.auditRepo.log({
      branchId: params.branchId,
      actorUserId: params.createdBy,
      entityType: "quote",
      entityId: quote.id,
      action: AuditAction.CREATE,
      afterJson: {
        currencyCode: params.currencyCode,
        requestedWidthM: params.requestedWidthM,
        requestedHeightM: params.requestedHeightM,
        quantity: params.quantity,
        totalRounded: params.totalRounded
      }
    });
    return { quoteId: quote.id };
  }

  async listQuotes(branchCode: string): Promise<
    Array<{
      id: string;
      currencyCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
      unitPrice: number;
      linearMeters: number;
      subtotalAmount: number;
      totalRounded: number;
      createdAt: string;
    }>
  > {
    const quotes = await this.prisma.quote.findMany({
      where: { branch: { code: branchCode } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return quotes.map((quote) => ({
      id: quote.id,
      currencyCode: quote.currencyCode,
      requestedWidthM: Number(quote.requestedWidthM),
      requestedHeightM: Number(quote.requestedHeightM),
      quantity: quote.quantity,
      unitPrice: Number(quote.unitPrice),
      linearMeters: Number(quote.linearMeters),
      subtotalAmount: Number(quote.subtotalAmount),
      totalRounded: Number(quote.totalRounded),
      createdAt: quote.createdAt.toISOString()
    }));
  }

  async getBranchSummaryByCode(branchCode: string): Promise<{ id: string; name: string } | null> {
    const branch = await this.prisma.branch.findFirst({
      where: { code: branchCode },
      select: { id: true, name: true }
    });
    return branch ?? null;
  }

  // SPEC-31: Price list cell methods
  async getCellPrice(params: {
    priceListId: string;
    skuId: string;
    requestedWidthM: number;
    requestedHeightM: number;
  }): Promise<{ unitPrice: number; cellId: string } | null> {
    // Find the most fitting cell: one where both max_width_m >= requestedWidthM
    // and max_height_m >= requestedHeightM, ordered by smallest difference
    const cell = await this.prisma.priceListCell.findFirst({
      where: {
        priceListId: params.priceListId,
        skuId: params.skuId,
        maxWidthM: { gte: params.requestedWidthM },
        maxHeightM: { gte: params.requestedHeightM }
      },
      orderBy: [
        { maxWidthM: "asc" },
        { maxHeightM: "asc" }
      ],
      select: {
        id: true,
        unitPrice: true
      }
    });

    if (!cell) return null;
    return {
      cellId: cell.id,
      unitPrice: Number(cell.unitPrice)
    };
  }

  async listCells(priceListId: string, skuId?: string): Promise<
    Array<{
      id: string;
      priceListId: string;
      skuId: string;
      maxWidthM: number;
      maxHeightM: number;
      unitPrice: number;
    }>
  > {
    const cells = await this.prisma.priceListCell.findMany({
      where: {
        priceListId,
        ...(skuId && { skuId })
      },
      orderBy: [
        { maxWidthM: "asc" },
        { maxHeightM: "asc" }
      ]
    });
    return cells.map((cell) => ({
      id: cell.id,
      priceListId: cell.priceListId,
      skuId: cell.skuId,
      maxWidthM: Number(cell.maxWidthM),
      maxHeightM: Number(cell.maxHeightM),
      unitPrice: Number(cell.unitPrice)
    }));
  }

  async createCell(params: {
    priceListId: string;
    skuId: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }): Promise<{
    id: string;
    priceListId: string;
    skuId: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }> {
    const cell = await this.prisma.priceListCell.create({
      data: {
        priceListId: params.priceListId,
        skuId: params.skuId,
        maxWidthM: params.maxWidthM,
        maxHeightM: params.maxHeightM,
        unitPrice: params.unitPrice
      }
    });
    await this.auditRepo.log({
      branchId: "", // Will be fetched from context if needed
      actorUserId: "",
      entityType: "price_list_cell",
      entityId: cell.id,
      action: AuditAction.CREATE,
      afterJson: {
        maxWidthM: params.maxWidthM,
        maxHeightM: params.maxHeightM,
        unitPrice: params.unitPrice
      }
    });
    return {
      id: cell.id,
      priceListId: cell.priceListId,
      skuId: cell.skuId,
      maxWidthM: Number(cell.maxWidthM),
      maxHeightM: Number(cell.maxHeightM),
      unitPrice: Number(cell.unitPrice)
    };
  }

  async createCellBySkuCode(params: {
    priceListId: string;
    skuCode: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }) {
    const priceList = await this.prisma.priceList.findUnique({
      where: { id: params.priceListId },
      select: { branchId: true }
    });
    if (!priceList) {
      throw new Error("Lista de precios no encontrada");
    }

    const sku = await this.prisma.fabricSku.findFirst({
      where: { branchId: priceList.branchId, code: params.skuCode, isActive: true },
      select: { id: true }
    });
    if (!sku) {
      throw new Error("SKU no encontrado");
    }

    return this.createCell({
      priceListId: params.priceListId,
      skuId: sku.id,
      maxWidthM: params.maxWidthM,
      maxHeightM: params.maxHeightM,
      unitPrice: params.unitPrice
    });
  }

  async updateCell(
    cellId: string,
    params: Partial<{
      maxWidthM: number;
      maxHeightM: number;
      unitPrice: number;
    }>
  ): Promise<{
    id: string;
    priceListId: string;
    skuId: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }> {
    const cell = await this.prisma.priceListCell.update({
      where: { id: cellId },
      data: params
    });
    await this.auditRepo.log({
      branchId: "",
      actorUserId: "",
      entityType: "price_list_cell",
      entityId: cell.id,
      action: AuditAction.UPDATE,
      afterJson: params
    });
    return {
      id: cell.id,
      priceListId: cell.priceListId,
      skuId: cell.skuId,
      maxWidthM: Number(cell.maxWidthM),
      maxHeightM: Number(cell.maxHeightM),
      unitPrice: Number(cell.unitPrice)
    };
  }

  async deleteCell(cellId: string): Promise<void> {
    const cell = await this.prisma.priceListCell.findUnique({
      where: { id: cellId }
    });
    if (!cell) return;

    await this.prisma.priceListCell.delete({
      where: { id: cellId }
    });
    await this.auditRepo.log({
      branchId: "",
      actorUserId: "",
      entityType: "price_list_cell",
      entityId: cellId,
      action: AuditAction.DELETE,
      beforeJson: {
        maxWidthM: Number(cell.maxWidthM),
        maxHeightM: Number(cell.maxHeightM),
        unitPrice: Number(cell.unitPrice)
      }
    });
  }
}
