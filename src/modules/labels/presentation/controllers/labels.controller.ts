import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UnprocessableEntityException
} from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { LabelsOperationsService } from "../../application/services/labels-operations.service";
import { BatchPrintDto, CreateGenericLabelBatchDto } from "../dto/labels.dto";

@Authenticated("superadmin", "admin", "operador")
@Controller("labels")
export class LabelsController {
  constructor(private readonly labelsOperations: LabelsOperationsService) {}

  @Post("quote/:quoteId")
  async createQuoteLabel(
    @Param("quoteId") quoteId: string,
    @Body() _body: { createdByEmail?: string },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      const label = await this.labelsOperations.createFromQuote(quoteId, auth.email);
      return { labelId: label.id };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("scrap/:scrapId")
  async createScrapLabel(
    @Param("scrapId") scrapId: string,
    @Body() _body: { createdByEmail?: string },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      const label = await this.labelsOperations.createFromScrap(scrapId, auth.email);
      return { labelId: label.id };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("sale/:saleId/batch")
  async createBatch(
    @Param("saleId") saleId: string,
    @Body() _body: object,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      const results = await this.labelsOperations.createBatchFromSale(saleId, auth.email);
      return { total: results.length, labels: results };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get()
  async list(
    @Query("branchCode") branchCode?: string,
    @Query("saleLineId") saleLineId?: string,
    @Query("scrapId") scrapId?: string,
    @Query("quoteId") quoteId?: string,
    @Query("type") type?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const result = await this.labelsOperations.list({
      branchCode,
      saleLineId,
      scrapId,
      quoteId,
      type: type?.toUpperCase(),
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
    return {
      data: result.data.map((label) => ({
        id: label.id,
        type: label.type,
        saleLineId: label.saleLineId,
        scrapId: label.scrapId,
        quoteId: label.quoteId,
        quoteCode: (label as any).saleLine?.sale?.quoteNumber ? `COT-${(label as any).saleLine.sale.quoteNumber}` : null,
        createdAt: label.createdAt.toISOString(),
        lastPrintedAt: label.printEvents[0]?.printedAt.toISOString() ?? null
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    };
  }

  @Get(":labelId/pdf")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getPdf(@Param("labelId") labelId: string) {
    try {
      const buffer = await this.labelsOperations.getHtmlContent(labelId);
      return new StreamableFile(buffer, { type: "text/html; charset=utf-8" });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get(":labelId/html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getHtml(@Param("labelId") labelId: string) {
    return this.getPdf(labelId);
  }

  @Get(":labelId/zpl")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async getZpl(@Param("labelId") labelId: string) {
    try {
      const buffer = await this.labelsOperations.getZplContent(labelId);
      return new StreamableFile(buffer, { type: "text/plain; charset=utf-8" });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("batch")
  async createGenericBatch(@Body() body: CreateGenericLabelBatchDto, @CurrentAuth() auth: AuthTokenPayload) {
    try {
      const results = await this.labelsOperations.createBatch({ branchCode: body.branchCode, items: body.items, createdByEmail: auth.email });
      return { total: results.length, labels: results };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("batch-pdf")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getBatchPdf(@Query("labelIds") labelIdsParam: string) {
    const labelIds = labelIdsParam ? labelIdsParam.split(",").filter(Boolean) : [];
    if (labelIds.length === 0) throw new UnprocessableEntityException("labelIds required");
    try {
      const buffer = await this.labelsOperations.getBatchHtmlContent(labelIds);
      return new StreamableFile(buffer, { type: "text/html; charset=utf-8" });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("batch-html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getBatchHtml(@Query("labelIds") labelIdsParam: string) {
    return this.getBatchPdf(labelIdsParam);
  }

  @Get("batch-zpl")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async getBatchZpl(@Query("labelIds") labelIdsParam: string) {
    const labelIds = labelIdsParam ? labelIdsParam.split(",").filter(Boolean) : [];
    if (labelIds.length === 0) throw new UnprocessableEntityException("labelIds required");
    try {
      const buffer = await this.labelsOperations.getBatchZplContent(labelIds);
      return new StreamableFile(buffer, { type: "text/plain; charset=utf-8" });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("batch-print")
  async batchPrint(@Body() body: BatchPrintDto, @CurrentAuth() auth: AuthTokenPayload) {
    try {
      const result = await this.labelsOperations.batchReprint(body.labelIds, auth.email);
      return result;
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post(":labelId/reprint")
  async reprint(
    @Param("labelId") labelId: string,
    @Body() _body: { printedByEmail?: string },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      const event = await this.labelsOperations.reprint(labelId, auth.email);
      return { printEventId: event.id, printedAt: event.printedAt.toISOString() };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }
}
