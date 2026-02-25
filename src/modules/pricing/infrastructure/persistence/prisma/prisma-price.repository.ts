import { AuditAction, PrismaClient } from "@prisma/client";
import type { PriceRepositoryPort } from "../../../application/ports/price-repository.port";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

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
        basePrice: true
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
      unitPrice: Number(item.basePrice)
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
}
