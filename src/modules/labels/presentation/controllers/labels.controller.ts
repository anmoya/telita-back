import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UnprocessableEntityException
} from "@nestjs/common";

import { PrismaLabelsRepository } from "../../infrastructure/persistence/prisma/prisma-labels.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("labels")
export class LabelsController {
  private readonly repo = new PrismaLabelsRepository();

  @Post("quote/:quoteId")
  async createQuoteLabel(
    @Param("quoteId") quoteId: string,
    @Body() _body: { createdByEmail?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const label = await this.repo.createFromQuote(quoteId, auth.email);
      return { labelId: label.id };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("scrap/:scrapId")
  async createScrapLabel(
    @Param("scrapId") scrapId: string,
    @Body() _body: { createdByEmail?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const label = await this.repo.createFromScrap(scrapId, auth.email);
      return { labelId: label.id };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("sale/:saleId/batch")
  async createBatch(
    @Param("saleId") saleId: string,
    @Body() _body: object,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const results = await this.repo.createBatchFromSale(saleId, auth.email);
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
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const labels = await this.repo.list({ branchCode, saleLineId, scrapId, quoteId });
    return labels.map((l) => ({
      id: l.id,
      type: l.type,
      saleLineId: l.saleLineId,
      scrapId: l.scrapId,
      quoteId: l.quoteId,
      createdAt: l.createdAt.toISOString(),
      lastPrintedAt: l.printEvents[0]?.printedAt.toISOString() ?? null
    }));
  }

  @Get(":labelId/pdf")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getPdf(
    @Param("labelId") labelId: string,
    @Headers("authorization") authorization?: string,
    @Query("accessToken") accessToken?: string
  ) {
    const auth = requireAuth(authorization ?? (accessToken ? `Bearer ${accessToken}` : undefined));
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const buffer = await this.repo.getPdfContent(labelId);
      return new StreamableFile(buffer, { type: "text/html; charset=utf-8" });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("batch")
  async createGenericBatch(
    @Body() body: {
      branchCode: string;
      items: Array<{ type: "SALE_LINE" | "SCRAP"; saleLineId?: string; scrapId?: string }>;
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const results = await this.repo.createBatch({ branchCode: body.branchCode, items: body.items, createdByEmail: auth.email });
      return { total: results.length, labels: results };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("batch-pdf")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getBatchPdf(
    @Query("labelIds") labelIdsParam: string,
    @Headers("authorization") authorization?: string,
    @Query("accessToken") accessToken?: string
  ) {
    const auth = requireAuth(authorization ?? (accessToken ? `Bearer ${accessToken}` : undefined));
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const labelIds = labelIdsParam ? labelIdsParam.split(",").filter(Boolean) : [];
    if (labelIds.length === 0) throw new UnprocessableEntityException("labelIds required");
    try {
      const buffer = await this.repo.getBatchPdfContent(labelIds);
      return new StreamableFile(buffer, { type: "text/html; charset=utf-8" });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post("batch-print")
  async batchPrint(
    @Body() body: { labelIds: string[] },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const result = await this.repo.batchReprint(body.labelIds, auth.email);
      return result;
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post(":labelId/reprint")
  async reprint(
    @Param("labelId") labelId: string,
    @Body() _body: { printedByEmail?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const event = await this.repo.reprint(labelId, auth.email);
      return { printEventId: event.id, printedAt: event.printedAt.toISOString() };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }
}
