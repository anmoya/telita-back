import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { ScrapsOperationsService } from "../../application/services/scraps-operations.service";

@Authenticated("superadmin", "admin", "operador")
@Controller("scraps")
export class ScrapsController {
  constructor(private readonly scrapsOperations: ScrapsOperationsService) {}

  @Post("register-from-quote")
  async registerFromQuote(
    @Body() body: { quoteId: string; generatedByEmail?: string },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    const scrap = await this.scrapsOperations.registerFromQuote({
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
  }

  @Get("match")
  async match(
    @Query("branchCode") branchCode = "MAIN",
    @Query("skuCode") skuCode: string,
    @Query("requestedWidthM") requestedWidthM: string,
    @Query("requestedHeightM") requestedHeightM: string,
    @Query("limit") limit?: string
  ) {
    if (!skuCode || !requestedWidthM || !requestedHeightM) {
      throw new BadRequestException("skuCode, requestedWidthM and requestedHeightM are required.");
    }
    const results = await this.scrapsOperations.match({
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

  @Post("quote-opportunity-preview")
  async quoteOpportunityPreview(
    @Body() body: {
      branchCode?: string;
      items?: Array<{
        itemId: string;
        itemIndex: number;
        skuCode: string;
        requestedWidthM: number;
        requestedHeightM: number;
        quantity: number;
      }>;
    }
  ) {
    if (!body.items?.length) {
      throw new BadRequestException("items is required.");
    }

    const result = await this.scrapsOperations.previewQuoteOpportunity({
      branchCode: body.branchCode ?? "MAIN",
      items: body.items
    });

    return {
      items: result.items,
      summary: result.summary
    };
  }

  @Get()
  async list(
    @Query("branchCode") branchCode?: string,
    @Query("status") status?: string,
    @Query("quoteCode") quoteCode?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const typedStatus = status ? status.toUpperCase() : undefined;
    const rawNumber = quoteCode ? parseInt(quoteCode.replace(/^COT-/i, ""), 10) : NaN;
    const quoteNumber = Number.isFinite(rawNumber) && rawNumber > 0 ? rawNumber : undefined;
    const result = await this.scrapsOperations.list({
      branchCode,
      status: typedStatus,
      quoteNumber,
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
        quoteCode: scrap.saleLine?.sale?.quoteNumber ? `COT-${scrap.saleLine.sale.quoteNumber}` : null,
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
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    const scrap = await this.scrapsOperations.assignLocation({
      scrapId: id,
      locationCode: body.locationCode,
      classifiedByEmail: auth.email
    });
    return { id: scrap.id, status: scrap.status, locationId: scrap.locationId };
  }

  // SPEC-58: Soft hold endpoints
  @Post(":id/soft-hold")
  async createSoftHold(
    @Param("id") id: string,
    @Body() body: { saleId: string; saleLineId?: string; saleLinePieceId?: string; minutes?: number; reason?: string },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    return this.scrapsOperations.createSoftHold({
      scrapId: id,
      saleId: body.saleId,
      saleLineId: body.saleLineId,
      saleLinePieceId: body.saleLinePieceId,
      heldByEmail: auth.email,
      minutes: body.minutes ?? 15,
      reason: body.reason
    });
  }

  @Get(":id/soft-hold")
  async getActiveSoftHold(@Param("id") id: string) {
    const hold = await this.scrapsOperations.getActiveSoftHold(id);
    if (!hold) return { active: false };
    return {
      active: true,
      id: hold.id,
      scrapId: hold.scrapId,
      saleId: hold.saleId,
      saleLineId: hold.saleLineId,
      saleLinePieceId: hold.saleLinePieceId,
      status: hold.status,
      expiresAt: hold.expiresAt.toISOString(),
      heldBy: { email: hold.heldByUser.email, fullName: hold.heldByUser.fullName },
      reason: hold.reason,
      createdAt: hold.createdAt.toISOString()
    };
  }

  @Delete(":id/soft-hold")
  async releaseSoftHold(@Param("id") id: string, @CurrentAuth() auth: AuthTokenPayload) {
    await this.scrapsOperations.releaseSoftHold({ scrapId: id, releasedByEmail: auth.email });
    return { ok: true };
  }
}
