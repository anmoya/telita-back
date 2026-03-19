import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const typedStatus = status ? status.toUpperCase() : undefined;
    const result = await this.repo.list({
      branchCode,
      status: typedStatus,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
    return {
      data: result.data.map((scrap) => ({
        id: scrap.id,
        status: scrap.status,
        areaM2: Number(scrap.areaM2),
        widthM: Number(scrap.widthM),
        heightM: Number(scrap.heightM),
        skuCode: scrap.sku.code,
        locationCode: scrap.location?.code ?? null,
        quoteId: scrap.quoteId,
        createdAt: scrap.createdAt.toISOString()
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    };
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

  // SPEC-58: Soft hold endpoints
  @Post(":id/soft-hold")
  async createSoftHold(
    @Param("id") id: string,
    @Body() body: { saleId: string; saleLineId?: string; minutes?: number; reason?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const result = await this.repo.createSoftHold({
        scrapId: id,
        saleId: body.saleId,
        saleLineId: body.saleLineId,
        heldByEmail: auth.email,
        minutes: body.minutes ?? 15,
        reason: body.reason
      });
      return result;
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get(":id/soft-hold")
  async getActiveSoftHold(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    requireAuth(authorization);
    const hold = await this.repo.getActiveSoftHold(id);
    if (!hold) return { active: false };
    return {
      active: true,
      id: hold.id,
      scrapId: hold.scrapId,
      saleId: hold.saleId,
      saleLineId: hold.saleLineId,
      status: hold.status,
      expiresAt: hold.expiresAt.toISOString(),
      heldBy: { email: hold.heldByUser.email, fullName: hold.heldByUser.fullName },
      reason: hold.reason,
      createdAt: hold.createdAt.toISOString()
    };
  }

  @Delete(":id/soft-hold")
  async releaseSoftHold(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.releaseSoftHold({ scrapId: id, releasedByEmail: auth.email });
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }
}
