import { Injectable } from "@nestjs/common";
import { PrismaClient, ScrapStatus, SaleStatus } from "@prisma/client";

@Injectable()
export class PrismaDashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getKpis(input: { branchCode: string; date?: string }) {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new Error("Sucursal no encontrada.");

    const target = input.date ? new Date(`${input.date}T00:00:00`) : new Date();
    const from = new Date(target);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    const [quotesCreatedToday, salesConfirmedToday, salesCanceledToday, pendingScraps, labelsPrintedToday] =
      await Promise.all([
        this.prisma.quote.count({ where: { branchId: branch.id, createdAt: { gte: from, lt: to } } }),
        this.prisma.sale.count({
          where: { branchId: branch.id, status: SaleStatus.CONFIRMED, createdAt: { gte: from, lt: to } }
        }),
        this.prisma.sale.count({
          where: { branchId: branch.id, status: SaleStatus.CANCELED, createdAt: { gte: from, lt: to } }
        }),
        this.prisma.scrap.count({ where: { branchId: branch.id, status: ScrapStatus.PENDING_INBOUND } }),
        this.prisma.labelPrintEvent.count({
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
    return this.prisma.scrap.findMany({
      where: {
        branch: { code: input.branchCode },
        status: ScrapStatus.PENDING_INBOUND
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
