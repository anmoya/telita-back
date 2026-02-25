import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import { PrismaScrapsRepository } from "../../infrastructure/persistence/prisma/prisma-scraps.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("scraps")
export class ScrapsController {
  private readonly repo = new PrismaScrapsRepository();

  @Post("register-from-quote")
  async registerFromQuote(
    @Body() body: { quoteId: string; generatedByEmail?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const scrap = await this.repo.registerFromQuote({
        quoteId: body.quoteId,
        generatedByEmail: auth.email
      });
      return {
        id: scrap.id,
        status: scrap.status,
        areaM2: Number(scrap.areaM2),
        widthM: Number(scrap.widthM),
        heightM: Number(scrap.heightM)
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("match")
  async match(
    @Query("branchCode") branchCode = "MAIN",
    @Query("skuCode") skuCode: string,
    @Query("requestedWidthM") requestedWidthM: string,
    @Query("requestedHeightM") requestedHeightM: string,
    @Query("limit") limit?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    if (!skuCode || !requestedWidthM || !requestedHeightM) {
      throw new BadRequestException("skuCode, requestedWidthM and requestedHeightM are required.");
    }
    const results = await this.repo.match({
      branchCode,
      skuCode,
      requestedWidthM: Number(requestedWidthM),
      requestedHeightM: Number(requestedHeightM),
      limit: limit ? Number(limit) : 10
    });
    return results.map((s) => ({
      id: s.id,
      widthM: Number(s.widthM),
      heightM: Number(s.heightM),
      areaM2: Number(s.areaM2),
      excessAreaM2: Number(s.excessAreaM2.toFixed(3)),
      skuCode: s.sku.code,
      locationCode: s.location?.code ?? null
    }));
  }

  @Get()
  async list(
    @Query("branchCode") branchCode?: string,
    @Query("status") status?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const typedStatus = status ? status.toUpperCase() : undefined;
    const scraps = await this.repo.list({ branchCode, status: typedStatus });
    return scraps.map((scrap) => ({
      id: scrap.id,
      status: scrap.status,
      areaM2: Number(scrap.areaM2),
      widthM: Number(scrap.widthM),
      heightM: Number(scrap.heightM),
      skuCode: scrap.sku.code,
      locationCode: scrap.location?.code ?? null,
      quoteId: scrap.quoteId
    }));
  }

  @Patch(":id/assign-location")
  async assignLocation(
    @Param("id") id: string,
    @Body() body: { locationCode: string; classifiedByEmail?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const scrap = await this.repo.assignLocation({
        scrapId: id,
        locationCode: body.locationCode,
        classifiedByEmail: auth.email
      });
      return { id: scrap.id, status: scrap.status, locationId: scrap.locationId };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }
}
