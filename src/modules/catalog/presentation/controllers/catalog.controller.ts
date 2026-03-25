import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { Roles } from "../../../../shared/presentation/roles.decorator";
import { CreateSkuUseCase } from "../../application/use-cases/create-sku.use-case";
import { ListAllSkusUseCase } from "../../application/use-cases/list-all-skus.use-case";
import { ListSkusUseCase } from "../../application/use-cases/list-skus.use-case";
import { ListUnitsUseCase } from "../../application/use-cases/list-units.use-case";
import { SetSkuStatusUseCase } from "../../application/use-cases/set-sku-status.use-case";
import { UpdateSkuUseCase } from "../../application/use-cases/update-sku.use-case";
import type { CreateSkuInput, UpdateSkuInput } from "../../infrastructure/persistence/prisma/prisma-catalog.repository";

@Authenticated("superadmin", "admin", "operador")
@Controller("catalog")
export class CatalogController {
  constructor(
    private readonly listSkusUseCase: ListSkusUseCase,
    private readonly listAllSkusUseCase: ListAllSkusUseCase,
    private readonly listUnitsUseCase: ListUnitsUseCase,
    private readonly createSkuUseCase: CreateSkuUseCase,
    private readonly updateSkuUseCase: UpdateSkuUseCase,
    private readonly setSkuStatusUseCase: SetSkuStatusUseCase
  ) {}

  @Get("skus")
  async listSkus(@Query("branchCode") branchCode = "MAIN") {
    const rows = await this.listSkusUseCase.execute(branchCode);
    return rows.map((row) => ({
      ...row,
      widthValue: Number(row.widthValue),
      lengthValue: Number(row.lengthValue),
      thicknessValue: Number(row.thicknessValue),
      weightValue: Number(row.weightValue)
    }));
  }

  @Get("all-skus")
  @Roles("superadmin", "admin")
  async listAllSkus(@Query("branchCode") branchCode = "MAIN") {
    try {
      return await this.listAllSkusUseCase.execute(branchCode);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Get("units")
  async listUnits() {
    try {
      return await this.listUnitsUseCase.execute();
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post("skus")
  @Roles("superadmin", "admin")
  async createSku(@Body() body: CreateSkuInput, @CurrentAuth() auth: AuthTokenPayload) {
    try {
      return await this.createSkuUseCase.execute(body, auth.sub);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Put("skus/:id")
  @Roles("superadmin", "admin")
  async updateSku(
    @Param("id") id: string,
    @Body() body: UpdateSkuInput,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      return await this.updateSkuUseCase.execute(id, body, auth.sub);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Patch("skus/:id/status")
  @Roles("superadmin", "admin")
  async setSkuStatus(
    @Param("id") id: string,
    @Body() body: { isActive: boolean },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      return await this.setSkuStatusUseCase.execute(id, body.isActive, auth.sub);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
