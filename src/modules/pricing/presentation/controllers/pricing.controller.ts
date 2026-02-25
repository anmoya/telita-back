import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { createQuoteUseCase } from "../../infrastructure/factories/create-quote-use-case.factory";
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
  private readonly priceRepo = new PrismaPriceRepository(prismaClient);

  @Post("quote")
  @HttpCode(HttpStatus.OK)
  async quote(@Body() body: CreateQuoteBody, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const result = await this.quoteUseCase.execute({
      ...body,
      createdByEmail: auth.email
    });
    return result;
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
