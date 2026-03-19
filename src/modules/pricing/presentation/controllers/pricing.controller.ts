import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query, UnprocessableEntityException } from "@nestjs/common";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";
import { SystemClockService } from "../../../../shared/infrastructure/time/system-clock.service";
import { CalculateQuoteBatchUseCase } from "../../application/use-cases/calculate-quote-batch.use-case";
import { CalculateQuoteUseCase } from "../../application/use-cases/calculate-quote.use-case";
import { PrismaPriceRepository } from "../../infrastructure/persistence/prisma/prisma-price.repository";
import { CreateQuoteDto, PreviewRequestDto, QuoteBatchRequestDto } from "../dto/pricing.dto";

@Controller("pricing")
export class PricingController {
  private readonly quoteUseCase: CalculateQuoteUseCase;
  private readonly quoteBatchUseCase: CalculateQuoteBatchUseCase;

  constructor(
    private readonly priceRepo: PrismaPriceRepository,
    private readonly clock: SystemClockService
  ) {
    this.quoteUseCase = new CalculateQuoteUseCase(clock, priceRepo);
    this.quoteBatchUseCase = new CalculateQuoteBatchUseCase(clock, priceRepo);
  }

  @Post("quote")
  @HttpCode(HttpStatus.OK)
  async quote(@Body() body: CreateQuoteDto, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const result = await this.quoteUseCase.execute({
        ...body,
        createdByEmail: auth.email
      });
      return result;
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("quote-batch")
  @HttpCode(HttpStatus.OK)
  async quoteBatch(
    @Body() body: QuoteBatchRequestDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const result = await this.quoteBatchUseCase.execute({
        branchCode: body.branchCode,
        priceListName: body.priceListName,
        createdByEmail: auth.email,
        items: body.items
      });
      if (result.hasErrors) {
        throw new UnprocessableEntityException(result);
      }
      return result;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  async preview(
    @Body() body: PreviewRequestDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);

    const batchInput = {
      branchCode: body.branchCode,
      priceListName: body.priceListName,
      createdByEmail: auth.email,
      items: body.items.map((it, idx) => ({
        clientItemId: String(idx),
        skuCode: it.skuCode,
        requestedWidthM: it.requestedWidthM,
        requestedHeightM: it.requestedHeightM,
        quantity: it.quantity,
        description: it.description
      }))
    };

    try {
      const batch = await this.quoteBatchUseCase.execute(batchInput);

      const branch = await this.priceRepo.getBranchSummaryByCode(body.branchCode);

      const lines = body.items.map((it, idx) => {
        const line = batch.lines[idx];
        if (!line) return null;
        if (!line.ok) return { index: idx, skuCode: it.skuCode, error: line.error };
        return {
          index: idx,
          skuCode: it.skuCode,
          description: it.description ?? it.skuCode,
          categoryName: it.categoryName ?? null,
          requestedWidthM: it.requestedWidthM,
          requestedHeightM: it.requestedHeightM,
          quantity: it.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          priceMethod: line.priceMethod,
          ...(body.mode === "INTERNAL" ? { linearMeters: line.linearMeters } : {})
        };
      }).filter(Boolean);

      const result: Record<string, unknown> = {
        header: {
          branchName: branch?.name ?? body.branchCode,
          date: new Date().toISOString(),
          priceListName: body.priceListName
        },
        customer: {
          name: body.customerName ?? null,
          reference: body.customerReference ?? null
        },
        lines,
        totals: {
          subtotal: batch.subtotalAmount,
          tax: batch.taxAmount,
          total: batch.totalAmount,
          currencyCode: batch.currencyCode
        },
        hasErrors: batch.hasErrors
      };

      if (body.mode === "INTERNAL") {
        result.internalBreakdown = {
          role: auth.role,
          lineDetails: lines
        };
      }

      return result;
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Error al generar preview");
    }
  }

  @Get("quotes")
  async listQuotes(
    @Query("branchCode") branchCode = "MAIN",
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    return this.priceRepo.listQuotes(branchCode);
  }
}
