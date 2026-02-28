import { ScrapStatus, SaleStatus } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";

export class PrismaDashboardRepository {
  async getKpis(input: { branchCode: string; date?: string }) {
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new Error("Sucursal no encontrada.");

    const target = input.date ? new Date(`${input.date}T00:00:00`) : new Date();
    const from = new Date(target);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    const [quotesCreatedToday, salesConfirmedToday, salesCanceledToday, pendingScraps, labelsPrintedToday] =
      await Promise.all([
        prismaClient.quote.count({ where: { branchId: branch.id, createdAt: { gte: from, lt: to } } }),
        prismaClient.sale.count({
          where: { branchId: branch.id, status: SaleStatus.CONFIRMED, createdAt: { gte: from, lt: to } }
        }),
        prismaClient.sale.count({
          where: { branchId: branch.id, status: SaleStatus.CANCELED, createdAt: { gte: from, lt: to } }
        }),
        prismaClient.scrap.count({ where: { branchId: branch.id, status: ScrapStatus.PENDING_STORAGE } }),
        prismaClient.labelPrintEvent.count({
          where: {
            printedAt: { gte: from, lt: to },
            label: { branchId: branch.id }
          }
        })
      ]);

    return {
      date: from.toISOString().slice(0, 10),
      branchCode: input.branchCode,
      quotesCreatedToday,
      salesConfirmedToday,
      salesCanceledToday,
      pendingScraps,
      labelsPrintedToday
    };
  }

  async getPendingScraps(input: { branchCode: string; limit?: number }) {
    return prismaClient.scrap.findMany({
      where: {
        branch: { code: input.branchCode },
        status: ScrapStatus.PENDING_STORAGE
      },
      include: {
        sku: { select: { code: true, name: true } },
        quote: { select: { id: true, createdAt: true } }
      },
      orderBy: { createdAt: "asc" },
      take: input.limit ?? 20
    });
  }
}
