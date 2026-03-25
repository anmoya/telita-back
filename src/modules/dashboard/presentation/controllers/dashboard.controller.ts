import { Controller, Get, Query } from "@nestjs/common";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { GetDashboardKpisUseCase } from "../../application/use-cases/get-dashboard-kpis.use-case";
import { GetPendingScrapsUseCase } from "../../application/use-cases/get-pending-scraps.use-case";

@Authenticated("superadmin", "admin", "operador")
@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly getDashboardKpisUseCase: GetDashboardKpisUseCase,
    private readonly getPendingScrapsUseCase: GetPendingScrapsUseCase
  ) {}

  @Get("kpis")
  async getKpis(
    @Query("branchCode") branchCode = "MAIN",
    @Query("date") date?: string
  ) {
    return this.getDashboardKpisUseCase.execute({ branchCode, date });
  }

  @Get("pending-scraps")
  async pendingScraps(
    @Query("branchCode") branchCode = "MAIN",
    @Query("limit") limit?: string
  ) {
    const rows = await this.getPendingScrapsUseCase.execute({
      branchCode,
      limit: limit ? Number(limit) : undefined
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      areaM2: Number(row.areaM2),
      widthM: Number(row.widthM),
      heightM: Number(row.heightM),
      skuCode: row.sku.code,
      skuName: row.sku.name,
      quoteId: row.quoteId,
      quoteCreatedAt: row.quote?.createdAt.toISOString() ?? null
    }));
  }
}
