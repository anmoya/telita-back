import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { PriceListItemRepositoryPort } from "../../../application/ports/price-list-item-repository.port";

@Injectable()
export class PrismaPriceListItemRepository implements PriceListItemRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getByPriceListId(priceListId: string) {
    const items = await this.prisma.priceListItem.findMany({
      where: { priceListId },
      select: {
        id: true,
        skuId: true,
        basePrice: true,
        discountPct: true,
        sku: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return items.map((item) => {
      const basePrice = Number(item.basePrice);
      const discountPct = Number(item.discountPct);
      const finalPrice = basePrice * (1 - discountPct / 100);
      return {
        id: item.id,
        skuId: item.skuId,
        skuCode: item.sku.code,
        skuName: item.sku.name,
        basePrice,
        discountPct,
        finalPrice: Math.round(finalPrice)
      };
    });
  }

  async create(params: {
    priceListId: string;
    skuCode: string;
    basePrice: number;
    discountPct: number;
  }) {
    const sku = await this.prisma.fabricSku.findFirst({
      where: { code: params.skuCode, isActive: true },
      select: { id: true }
    });
    if (!sku) throw new Error("SKU no encontrado o inactivo");

    // Check for duplicate
    const existing = await this.prisma.priceListItem.findUnique({
      where: {
        priceListId_skuId: { priceListId: params.priceListId, skuId: sku.id }
      }
    });
    if (existing) throw new Error("El SKU ya existe en esta lista de precios");

    const item = await this.prisma.priceListItem.create({
      data: {
        priceListId: params.priceListId,
        skuId: sku.id,
        basePrice: params.basePrice,
        discountPct: params.discountPct
      },
      select: { id: true }
    });

    return { id: item.id };
  }

  async update(id: string, params: { basePrice?: number; discountPct?: number }) {
    const updateData: Record<string, unknown> = {};
    if (params.basePrice !== undefined) updateData.basePrice = params.basePrice;
    if (params.discountPct !== undefined) updateData.discountPct = params.discountPct;

    await this.prisma.priceListItem.update({
      where: { id },
      data: updateData
    });
  }

  async delete(id: string) {
    await this.prisma.priceListItem.delete({
      where: { id }
    });
  }

  async existsByPriceListAndSku(priceListId: string, skuId: string) {
    const count = await this.prisma.priceListItem.count({
      where: { priceListId, skuId }
    });
    return count > 0;
  }

  async getById(id: string) {
    const item = await this.prisma.priceListItem.findUnique({
      where: { id },
      select: {
        id: true,
        skuId: true,
        basePrice: true,
        discountPct: true,
        sku: {
          select: {
            code: true,
            name: true
          }
        }
      }
    });

    if (!item) return null;

    const basePrice = Number(item.basePrice);
    const discountPct = Number(item.discountPct);
    const finalPrice = basePrice * (1 - discountPct / 100);

    return {
      id: item.id,
      skuId: item.skuId,
      skuCode: item.sku.code,
      skuName: item.sku.name,
      basePrice,
      discountPct,
      finalPrice: Math.round(finalPrice)
    };
  }
}
