import { Controller, Get, Headers, Query } from "@nestjs/common";
import { PrismaCatalogRepository } from "../../infrastructure/persistence/prisma/prisma-catalog.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("catalog")
export class CatalogController {
  private readonly repo = new PrismaCatalogRepository();

  @Get("skus")
  async listSkus(
    @Query("branchCode") branchCode = "MAIN",
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const rows = await this.repo.listSkus(branchCode);
    return rows.map((row) => ({
      ...row,
      widthValue: Number(row.widthValue),
      lengthValue: Number(row.lengthValue),
      thicknessValue: Number(row.thicknessValue),
      weightValue: Number(row.weightValue)
    }));
  }
}
