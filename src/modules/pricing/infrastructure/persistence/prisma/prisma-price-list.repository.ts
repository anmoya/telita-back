import { PrismaClient, SaleStatus } from "@prisma/client";
import type { PriceListRepositoryPort } from "../../../application/ports/price-list-repository.port";

export class PrismaPriceListRepository implements PriceListRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getByBranchCode(branchCode: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { code: branchCode },
      select: { id: true }
    });
    if (!branch) return [];

    const priceLists = await this.prisma.priceList.findMany({
      where: { branchId: branch.id },
      select: {
        id: true,
        name: true,
        currencyCode: true,
        validFrom: true,
        validTo: true,
        isActive: true,
        _count: { select: { items: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return priceLists.map((pl) => ({
      id: pl.id,
      name: pl.name,
      currencyCode: pl.currencyCode,
      validFrom: pl.validFrom,
      validTo: pl.validTo,
      isActive: pl.isActive,
      itemCount: pl._count.items
    }));
  }

  async getById(id: string) {
    const priceList = await this.prisma.priceList.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        name: true,
        currencyCode: true,
        validFrom: true,
        validTo: true,
        isActive: true,
        createdAt: true,
        branch: { select: { code: true } }
      }
    });

    if (!priceList) return null;

    return {
      id: priceList.id,
      branchId: priceList.branchId,
      branchCode: priceList.branch.code,
      name: priceList.name,
      currencyCode: priceList.currencyCode,
      validFrom: priceList.validFrom,
      validTo: priceList.validTo,
      isActive: priceList.isActive,
      createdAt: priceList.createdAt
    };
  }

  async create(params: {
    branchCode: string;
    name: string;
    currencyCode: string;
    validFrom: Date;
    validTo?: Date | null;
  }) {
    const branch = await this.prisma.branch.findUnique({
      where: { code: params.branchCode },
      select: { id: true }
    });
    if (!branch) throw new Error("Sucursal no encontrada");

    const priceList = await this.prisma.priceList.create({
      data: {
        branchId: branch.id,
        name: params.name,
        currencyCode: params.currencyCode,
        validFrom: params.validFrom,
        validTo: params.validTo ?? null
      },
      select: { id: true }
    });

    return { id: priceList.id };
  }

  async update(id: string, params: { name?: string; validFrom?: Date; validTo?: Date | null }) {
    const updateData: Record<string, unknown> = {};
    if (params.name !== undefined) updateData.name = params.name;
    if (params.validFrom !== undefined) updateData.validFrom = params.validFrom;
    if (params.validTo !== undefined) updateData.validTo = params.validTo;

    await this.prisma.priceList.update({
      where: { id },
      data: updateData
    });
  }

  async toggleStatus(id: string): Promise<boolean> {
    const priceList = await this.prisma.priceList.findUnique({
      where: { id },
      select: { isActive: true }
    });
    if (!priceList) throw new Error("Lista de precios no encontrada");

    const newStatus = !priceList.isActive;

    await this.prisma.priceList.update({
      where: { id },
      data: { isActive: newStatus }
    });

    return newStatus;
  }

  async hasActiveSales(priceListId: string): Promise<boolean> {
    const count = await this.prisma.sale.count({
      where: {
        priceListId,
        status: SaleStatus.DRAFT
      }
    });
    return count > 0;
  }
}
