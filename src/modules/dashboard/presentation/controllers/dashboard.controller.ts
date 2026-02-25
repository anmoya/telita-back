import { Controller, Get, Headers, Query } from "@nestjs/common";
import { PrismaDashboardRepository } from "../../infrastructure/persistence/prisma/prisma-dashboard.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("dashboard")
export class DashboardController {
  private readonly repo = new PrismaDashboardRepository();

  @Get("kpis")
  async getKpis(
    @Query("branchCode") branchCode = "MAIN",
    @Query("date") date?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    return this.repo.getKpis({ branchCode, date });
  }

  @Get("pending-scraps")
  async pendingScraps(
    @Query("branchCode") branchCode = "MAIN",
    @Query("limit") limit?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);

    const rows = await this.repo.getPendingScraps({
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
