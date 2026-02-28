import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query, UnprocessableEntityException } from "@nestjs/common";
import { createQuoteUseCase, createQuoteBatchUseCase } from "../../infrastructure/factories/create-quote-use-case.factory";
import type { QuoteBatchItem } from "../../application/use-cases/calculate-quote-batch.use-case";
import { prismaClient } from "../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaPriceRepository } from "../../infrastructure/persistence/prisma/prisma-price.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

type CreateQuoteBody = {
  branchCode: string;
  skuCode: string;
  priceListName: string;
  requestedWidthM: number;
  requestedHeightM: number;
  quantity: number;
};

@Controller("pricing")
export class PricingController {
  private readonly quoteUseCase = createQuoteUseCase();
  private readonly quoteBatchUseCase = createQuoteBatchUseCase();
  private readonly priceRepo = new PrismaPriceRepository(prismaClient);

  @Post("quote")
  @HttpCode(HttpStatus.OK)
  async quote(@Body() body: CreateQuoteBody, @Headers("authorization") authorization?: string) {
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
    @Body() body: { branchCode: string; priceListName: string; items: QuoteBatchItem[] },
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
    @Body() body: {
      mode: "CUSTOMER" | "INTERNAL";
      branchCode: string;
      priceListName: string;
      customerName?: string;
      customerReference?: string;
      items: Array<{
        skuCode: string;
        requestedWidthM: number;
        requestedHeightM: number;
        quantity: number;
        description?: string;
        categoryName?: string;
      }>;
    },
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

      const branch = await prismaClient.branch.findFirst({ where: { code: body.branchCode } });

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
