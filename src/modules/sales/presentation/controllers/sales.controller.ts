import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException
} from "@nestjs/common";
import { Headers } from "@nestjs/common";
import { PrismaSalesRepository } from "../../infrastructure/persistence/prisma/prisma-sales.repository";
import { PrismaScrapsRepository } from "../../../scraps/infrastructure/persistence/prisma/prisma-scraps.repository";
import { PrismaSettingsRepository } from "../../../settings/infrastructure/persistence/prisma/prisma-settings.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("sales")
export class SalesController {
  private readonly repo = new PrismaSalesRepository();
  private readonly scrapsRepo = new PrismaScrapsRepository();
  private readonly settingsRepo = new PrismaSettingsRepository();

  @Post("from-quote")
  @HttpCode(HttpStatus.OK)
  async createFromQuote(
    @Body() body: {
      branchCode: string;
      priceListName: string;
      customerName?: string;
      customerReference?: string;
      items: Array<{
        skuCode: string;
        requestedWidthM: number;
        requestedHeightM: number;
        quantity: number;
        categoryId?: string;
        categoryName?: string;
        displayOrder?: number;
        lineNote?: string;
      }>;
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const result = await this.repo.createFromQuote({ ...body, createdByEmail: auth.email });
      return {
        saleId: result.sale.id,
        quoteCode: `COT-${result.sale.quoteNumber}`,
        status: result.sale.status,
        linesCreated: result.linesCreated,
        subtotalAmount: result.subtotalAmount,
        taxAmount: result.taxAmount,
        totalAmount: result.totalAmount
      };
    } catch (error) {
      if (error instanceof Error && (error as { isValidationError?: boolean }).isValidationError) {
        throw new UnprocessableEntityException({
          message: "Some items are invalid",
          lineErrors: (error as { lineErrors?: unknown }).lineErrors
        });
      }
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post()
  async createDraft(
    @Body()
    body: {
      branchCode: string;
      priceListName: string;
      customerName?: string;
      customerReference?: string;
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const sale = await this.repo.createDraft({ ...body, createdByEmail: auth.email });
      return { saleId: sale.id, quoteCode: `COT-${sale.quoteNumber}`, status: sale.status };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post(":saleId/lines")
  async addLine(
    @Param("saleId") saleId: string,
    @Body() body: {
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
      categoryId?: string;
      categoryName?: string;
      displayOrder?: number;
      lineNote?: string;
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.addLine(saleId, { ...body, createdByEmail: auth.email });
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post(":saleId/confirm")
  async confirm(@Param("saleId") saleId: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const rules = await this.settingsRepo.getFlowRules();
      await this.repo.confirm(saleId, rules);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post(":saleId/cancel")
  async cancel(
    @Param("saleId") saleId: string,
    @Body() body: { canceledReason?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.cancel(saleId, body.canceledReason);
      return { ok: true };
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.includes("cannot be canceled")) {
        throw new ConflictException(message);
      }
      throw new BadRequestException(message);
    }
  }

  @Post(":saleId/lines/:saleLineId/allocate-scrap")
  async allocateScrap(
    @Param("saleId") _saleId: string,
    @Param("saleLineId") saleLineId: string,
    @Body() body: { scrapId: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.scrapsRepo.allocateToSaleLine({
        saleLineId,
        scrapId: body.scrapId,
        allocatedByEmail: auth.email
      });
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Delete(":saleId/lines/:saleLineId/allocate-scrap")
  async releaseAllocation(
    @Param("saleId") _saleId: string,
    @Param("saleLineId") saleLineId: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.scrapsRepo.releaseAllocation({ saleLineId, releasedByEmail: auth.email });
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Patch(":saleId")
  async updateCustomer(
    @Param("saleId") saleId: string,
    @Body() body: { customerName?: string | null; customerReference?: string | null },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.updateCustomer(saleId, auth.email, body);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Patch(":saleId/payment-summary")
  async updatePaymentSummary(
    @Param("saleId") saleId: string,
    @Body() body: { amountPaid: number },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.updatePaymentSummary(saleId, body.amountPaid);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Get()
  async list(@Query("branchCode") branchCode = "MAIN", @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const sales = await this.repo.list(branchCode);
    return sales.map((sale) => ({
      id: sale.id,
      quoteCode: `COT-${sale.quoteNumber}`,
      quoteNumber: sale.quoteNumber,
      status: sale.status,
      customerName: sale.customerName,
      customerReference: sale.customerReference,
      subtotalAmount: Number(sale.subtotalAmount),
      taxAmount: Number(sale.taxAmount),
      totalAmount: Number(sale.totalAmount),
      amountPaid: Number(sale.amountPaid),
      balanceDue: Number(sale.balanceDue),
      lines: sale.lines.map((line) => ({
        id: line.id,
        skuCode: line.sku.code,
        quantity: line.quantity,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
        allocatedScrapId: line.allocations[0]?.scrapId ?? null,
        categoryId: line.categoryId ?? null,
        categoryName: line.category?.name ?? null,
        displayOrder: line.displayOrder,
        lineNote: line.lineNote ?? null
      }))
    }));
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
