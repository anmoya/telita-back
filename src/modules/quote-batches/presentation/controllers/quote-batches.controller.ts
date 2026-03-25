import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { CancelQuoteBatchUseCase } from "../../application/use-cases/cancel-quote-batch.use-case";
import { CreateQuoteBatchUseCase } from "../../application/use-cases/create-quote-batch.use-case";
import { DuplicateQuoteBatchUseCase } from "../../application/use-cases/duplicate-quote-batch.use-case";
import { FinalizeQuoteBatchUseCase } from "../../application/use-cases/finalize-quote-batch.use-case";
import { GetQuoteBatchByIdUseCase } from "../../application/use-cases/get-quote-batch-by-id.use-case";
import { ListQuoteBatchesUseCase } from "../../application/use-cases/list-quote-batches.use-case";
import { UpdateQuoteBatchUseCase } from "../../application/use-cases/update-quote-batch.use-case";
import type { PrismaQuoteBatchesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-batches.repository";

type PriceMethodCode = "LINEAR_METER" | "AREA" | "FIXED" | "TABLE_LOOKUP";
type QuoteBatchStatusCode = "DRAFT" | "FINALIZED" | "EXPIRED" | "CANCELED";

type LineInput = {
  skuCode: string;
  requestedWidthM: number;
  requestedHeightM: number;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  priceMethod: PriceMethodCode;
  categoryId?: string;
  categoryName?: string;
  lineNote?: string;
  displayOrder?: number;
};

@Authenticated("superadmin", "admin", "operador")
@Controller("quotes/batch")
export class QuoteBatchesController {
  constructor(
    private readonly createQuoteBatchUseCase: CreateQuoteBatchUseCase,
    private readonly listQuoteBatchesUseCase: ListQuoteBatchesUseCase,
    private readonly getQuoteBatchByIdUseCase: GetQuoteBatchByIdUseCase,
    private readonly updateQuoteBatchUseCase: UpdateQuoteBatchUseCase,
    private readonly duplicateQuoteBatchUseCase: DuplicateQuoteBatchUseCase,
    private readonly finalizeQuoteBatchUseCase: FinalizeQuoteBatchUseCase,
    private readonly cancelQuoteBatchUseCase: CancelQuoteBatchUseCase
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: {
      branchCode: string;
      priceListName: string;
      customerId?: string;
      customerName?: string;
      customerReference?: string;
      amountPaid?: number;
      commercialAdjustmentPct?: number;
      installationAmount?: number;
      lines: LineInput[];
    },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      const batch = await this.createQuoteBatchUseCase.execute({ ...body, createdByEmail: auth.email });
      return { id: batch.id, status: batch.status, quoteCode: batch.quoteNumber > 0 ? `COT-${batch.quoteNumber}` : null };
    } catch (error) {
      throw new BadRequestException(msg(error));
    }
  }

  @Get()
  async list(
    @Query("branchCode") branchCode = "MAIN",
    @Query("status") status?: string,
    @Query("customerName") customerName?: string,
    @Query("customerReference") customerReference?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const result = await this.listQuoteBatchesUseCase.execute(branchCode, {
      status: status as QuoteBatchStatusCode | undefined,
      customerName,
      customerReference,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
    return {
      data: result.data.map(serializeBatch),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const batch = await this.getQuoteBatchByIdUseCase.execute(id);
    if (!batch) throw new BadRequestException("Cotización no encontrada.");
    return serializeBatch(batch);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: {
      customerId?: string | null;
      customerName?: string;
      customerReference?: string;
      amountPaid?: number;
      commercialAdjustmentPct?: number;
      installationAmount?: number;
      lines?: LineInput[];
    },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      await this.updateQuoteBatchUseCase.execute(id, auth.email, body);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(msg(error));
    }
  }

  @Post(":id/duplicate")
  @HttpCode(HttpStatus.OK)
  async duplicate(@Param("id") id: string, @CurrentAuth() auth: AuthTokenPayload) {
    try {
      const copy = await this.duplicateQuoteBatchUseCase.execute(id, auth.email);
      return { id: copy.id, status: copy.status, quoteCode: copy.quoteNumber > 0 ? `COT-${copy.quoteNumber}` : null };
    } catch (error) {
      throw new BadRequestException(msg(error));
    }
  }

  @Post(":id/finalize")
  @HttpCode(HttpStatus.OK)
  async finalize(@Param("id") id: string, @CurrentAuth() auth: AuthTokenPayload) {
    try {
      await this.finalizeQuoteBatchUseCase.execute(id, auth.email);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(msg(error));
    }
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(@Param("id") id: string, @CurrentAuth() auth: AuthTokenPayload) {
    try {
      await this.cancelQuoteBatchUseCase.execute(id, auth.email);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(msg(error));
    }
  }
}

type BatchRow = Awaited<ReturnType<PrismaQuoteBatchesRepository["findById"]>>;
type BatchListResult = Awaited<ReturnType<PrismaQuoteBatchesRepository["list"]>>;
type BatchListRow = BatchListResult["data"][number];

function serializeBatch(b: NonNullable<BatchRow> | BatchListRow) {
  const totalAmount = Number(b.totalAmount);
  const amountPaid = Number(b.amountPaid);
  const balanceDue = Math.max(totalAmount - amountPaid, 0);
  const amountPaidPct = totalAmount > 0 ? Number(((amountPaid / totalAmount) * 100).toFixed(1)) : 0;
  return {
    id: b.id,
    quoteNumber: b.quoteNumber,
    quoteCode: b.quoteNumber > 0 ? `COT-${b.quoteNumber}` : null,
    status: b.status,
    priceListName: b.priceList.name,
    customerId: b.customerId,
    customerName: b.customerName,
    customerReference: b.customerReference,
    commercialAdjustmentPct: Number(b.commercialAdjustmentPct),
    commercialAdjustmentAmount: Number(b.commercialAdjustmentAmount),
    installationAmount: Number(b.installationAmount),
    subtotalAmount: Number(b.subtotalAmount),
    taxAmount: Number(b.taxAmount),
    totalAmount,
    amountPaid,
    balanceDue,
    amountPaidPct,
    createdAt: b.createdAt.toISOString(),
    createdBy: b.createdByUser.fullName,
    lines: b.lines.map((l, i) => ({
      id: l.id,
      skuCode: l.sku.code,
      skuName: l.sku.name,
      requestedWidthM: Number(l.requestedWidthM),
      requestedHeightM: Number(l.requestedHeightM),
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      lineSubtotal: Number(l.lineSubtotal),
      priceMethod: l.priceMethod,
      categoryId: l.categoryId,
      categoryName: l.category?.name ?? null,
      lineNote: l.lineNote,
      displayOrder: l.displayOrder ?? i
    }))
  };
}

function msg(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}
