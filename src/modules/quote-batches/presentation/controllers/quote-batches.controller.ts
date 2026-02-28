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
import { Headers } from "@nestjs/common";
import { PrismaQuoteBatchesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-batches.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";
import { PriceMethod, QuoteBatchStatus } from "@prisma/client";

type LineInput = {
  skuCode: string;
  requestedWidthM: number;
  requestedHeightM: number;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  priceMethod: PriceMethod;
  categoryId?: string;
  categoryName?: string;
  lineNote?: string;
  displayOrder?: number;
};

@Controller("quotes/batch")
export class QuoteBatchesController {
  private readonly repo = new PrismaQuoteBatchesRepository();

  @Post()
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: {
      branchCode: string;
      priceListName: string;
      customerName?: string;
      customerReference?: string;
      lines: LineInput[];
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const batch = await this.repo.create({ ...body, createdByEmail: auth.email });
      return { id: batch.id, status: batch.status };
    } catch (error) {
      throw new BadRequestException(msg(error));
    }
  }

  @Get()
  async list(
    @Query("branchCode") branchCode = "MAIN",
    @Query("status") status?: string,
    @Query("customerName") customerName?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const batches = await this.repo.list(branchCode, {
      status: status as QuoteBatchStatus | undefined,
      customerName
    });
    return batches.map(serializeBatch);
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const batch = await this.repo.findById(id);
    if (!batch) throw new BadRequestException("Cotización no encontrada.");
    return serializeBatch(batch);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: {
      customerName?: string;
      customerReference?: string;
      lines?: LineInput[];
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.update(id, auth.email, body);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(msg(error));
    }
  }

  @Post(":id/duplicate")
  @HttpCode(HttpStatus.OK)
  async duplicate(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const copy = await this.repo.duplicate(id, auth.email);
      return { id: copy.id, status: copy.status };
    } catch (error) {
      throw new BadRequestException(msg(error));
    }
  }

  @Post(":id/finalize")
  @HttpCode(HttpStatus.OK)
  async finalize(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.finalize(id, auth.email);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(msg(error));
    }
  }
}

type BatchRow = Awaited<ReturnType<PrismaQuoteBatchesRepository["findById"]>>;

function serializeBatch(b: NonNullable<BatchRow>) {
  return {
    id: b.id,
    status: b.status,
    priceListName: b.priceList.name,
    customerName: b.customerName,
    customerReference: b.customerReference,
    subtotalAmount: Number(b.subtotalAmount),
    taxAmount: Number(b.taxAmount),
    totalAmount: Number(b.totalAmount),
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
