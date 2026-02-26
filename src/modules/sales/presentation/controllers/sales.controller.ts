import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query
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
    @Body() body: { skuCode: string; requestedWidthM: number; requestedHeightM: number; quantity: number },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.addLine(saleId, body);
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
      lines: sale.lines.map((line) => ({
        id: line.id,
        skuCode: line.sku.code,
        quantity: line.quantity,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
        allocatedScrapId: line.allocations[0]?.scrapId ?? null
      }))
    }));
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
