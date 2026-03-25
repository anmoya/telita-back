import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UnprocessableEntityException } from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { BuildQuotePreviewUseCase } from "../../application/use-cases/build-quote-preview.use-case";
import { CalculateQuoteBatchUseCase } from "../../application/use-cases/calculate-quote-batch.use-case";
import { CalculateQuoteUseCase } from "../../application/use-cases/calculate-quote.use-case";
import { ListQuotesUseCase } from "../../application/use-cases/list-quotes.use-case";
import { CreateQuoteDto, PreviewRequestDto, QuoteBatchRequestDto } from "../dto/pricing.dto";

@Authenticated("superadmin", "admin", "operador")
@Controller("pricing")
export class PricingController {
  constructor(
    private readonly quoteUseCase: CalculateQuoteUseCase,
    private readonly quoteBatchUseCase: CalculateQuoteBatchUseCase,
    private readonly buildQuotePreviewUseCase: BuildQuotePreviewUseCase,
    private readonly listQuotesUseCase: ListQuotesUseCase
  ) {}

  @Post("quote")
  @HttpCode(HttpStatus.OK)
  async quote(@Body() body: CreateQuoteDto, @CurrentAuth() auth: AuthTokenPayload) {
    return this.quoteUseCase.execute({
      ...body,
      createdByEmail: auth.email
    });
  }

  @Post("quote-batch")
  @HttpCode(HttpStatus.OK)
  async quoteBatch(
    @Body() body: QuoteBatchRequestDto,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
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
  }

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  async preview(
    @Body() body: PreviewRequestDto,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    return this.buildQuotePreviewUseCase.execute({
      mode: body.mode,
      branchCode: body.branchCode,
      priceListName: body.priceListName,
      customerName: body.customerName,
      customerReference: body.customerReference,
      commercialAdjustmentPct: body.commercialAdjustmentPct,
      installationAmount: body.installationAmount,
      createdByEmail: auth.email,
      actorRole: auth.role,
      items: body.items
    });
  }

  @Get("quotes")
  async listQuotes(@Query("branchCode") branchCode = "MAIN") {
    return this.listQuotesUseCase.execute(branchCode);
  }
}
