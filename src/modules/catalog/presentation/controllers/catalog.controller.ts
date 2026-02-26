import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { PrismaCatalogRepository, CreateSkuInput, UpdateSkuInput } from "../../infrastructure/persistence/prisma/prisma-catalog.repository";
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

  @Get("all-skus")
  async listAllSkus(
    @Query("branchCode") branchCode = "MAIN",
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return await this.repo.listAllSkus(branchCode);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Get("units")
  async listUnits(@Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      return await this.repo.listUnits();
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post("skus")
  async createSku(
    @Body() body: CreateSkuInput,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return await this.repo.createSku(body, auth.sub);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Put("skus/:id")
  async updateSku(
    @Param("id") id: string,
    @Body() body: UpdateSkuInput,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return await this.repo.updateSku(id, body, auth.sub);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Patch("skus/:id/status")
  async setSkuStatus(
    @Param("id") id: string,
    @Body() body: { isActive: boolean },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return await this.repo.setSkuStatus(id, body.isActive, auth.sub);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
