import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UnprocessableEntityException
} from "@nestjs/common";
import { Headers } from "@nestjs/common";
import { PrismaSalesRepository } from "../../infrastructure/persistence/prisma/prisma-sales.repository";
import { PrismaScrapsRepository } from "../../../scraps/infrastructure/persistence/prisma/prisma-scraps.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";
import { prismaClient } from "../../../../shared/infrastructure/persistence/prisma-client";

@Controller("sales")
export class SalesController {
  private readonly repo = new PrismaSalesRepository();
  private readonly scrapsRepo = new PrismaScrapsRepository();

  @Post("from-quote")
  @HttpCode(HttpStatus.OK)
  async createFromQuote(
    @Body() body: {
      branchCode: string;
      priceListName: string;
      customerId?: string;
      customerName?: string;
      customerReference?: string;
      manualDiscountPct?: number;
      manualDiscountReason?: string;
      items: Array<{
        skuCode: string;
        requestedWidthM: number;
        requestedHeightM: number;
        quantity: number;
        roomAreaName?: string;
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
      customerId?: string;
      customerName?: string;
      customerReference?: string;
      manualDiscountPct?: number;
      manualDiscountReason?: string;
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
      roomAreaName?: string;
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
      await this.repo.confirm(saleId);
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
    @Body()
    body: {
      customerId?: string | null;
      customerName?: string | null;
      customerReference?: string | null;
      manualDiscountPct?: number | null;
      manualDiscountReason?: string | null;
    },
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
      customerId: sale.customerId ?? null,
      customerName: sale.customerName,
      customerReference: sale.customerReference,
      customer: sale.customer
        ? {
            id: sale.customer.id,
            code: sale.customer.code,
            fullName: sale.customer.fullName,
            phone: sale.customer.phone,
            email: sale.customer.email,
            companyOrReference: sale.customer.companyOrReference,
            discountCode: sale.customer.discountCode
          }
        : null,
      manualDiscountPct: Number(sale.manualDiscountPct),
      manualDiscountReason: sale.manualDiscountReason,
      discountSource: sale.discountSource,
      discountCodeApplied: sale.discountCodeApplied,
      discountPctApplied: Number(sale.discountPctApplied),
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
        lineNote: line.lineNote ?? null,
        roomAreaName: line.roomAreaName ?? null,
        discountPct: Number(line.discountPct),
        lineSubtotal: Number(line.lineSubtotal),
        pieces: line.pieces.map((piece) => ({
          id: piece.id,
          pieceIndex: piece.pieceIndex,
          pieceTotal: piece.pieceTotal,
          requestedWidthM: Number(piece.requestedWidthM),
          requestedHeightM: Number(piece.requestedHeightM),
          roomAreaName: piece.roomAreaName ?? null
        }))
      }))
    }));
  }

  @Get(":saleId/print/sale/html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async printSaleHtml(@Param("saleId") saleId: string, @Headers("authorization") authorization?: string, @Query("accessToken") accessToken?: string) {
    const auth = requireAuth(authorization ?? (accessToken ? `Bearer ${accessToken}` : undefined));
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const sale = await getSalePrintable(saleId);
    return new StreamableFile(Buffer.from(renderSaleDocumentHtml(sale, "sale"), "utf-8"), { type: "text/html; charset=utf-8" });
  }

  @Get(":saleId/print/work-order/html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async printWorkOrderHtml(@Param("saleId") saleId: string, @Headers("authorization") authorization?: string, @Query("accessToken") accessToken?: string) {
    const auth = requireAuth(authorization ?? (accessToken ? `Bearer ${accessToken}` : undefined));
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const sale = await getSalePrintable(saleId);
    return new StreamableFile(Buffer.from(renderSaleDocumentHtml(sale, "work-order"), "utf-8"), { type: "text/html; charset=utf-8" });
  }

  @Get(":saleId/print/sale/zpl")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async printSaleZpl(@Param("saleId") saleId: string, @Headers("authorization") authorization?: string, @Query("accessToken") accessToken?: string) {
    const auth = requireAuth(authorization ?? (accessToken ? `Bearer ${accessToken}` : undefined));
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const sale = await getSalePrintable(saleId);
    return new StreamableFile(Buffer.from(renderSaleDocumentZpl(sale, "sale"), "utf-8"), { type: "text/plain; charset=utf-8" });
  }

  @Get(":saleId/print/work-order/zpl")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async printWorkOrderZpl(@Param("saleId") saleId: string, @Headers("authorization") authorization?: string, @Query("accessToken") accessToken?: string) {
    const auth = requireAuth(authorization ?? (accessToken ? `Bearer ${accessToken}` : undefined));
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const sale = await getSalePrintable(saleId);
    return new StreamableFile(Buffer.from(renderSaleDocumentZpl(sale, "work-order"), "utf-8"), { type: "text/plain; charset=utf-8" });
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

async function getSalePrintable(saleId: string) {
  const sale = await prismaClient.sale.findUnique({
    where: { id: saleId },
    include: {
      branch: true,
      customer: true,
      priceList: true,
      lines: {
        include: {
          sku: true,
          pieces: { orderBy: { pieceIndex: "asc" } }
        },
        orderBy: { displayOrder: "asc" }
      }
    }
  });
  if (!sale) throw new BadRequestException("Venta no encontrada.");
  return sale;
}

function renderSaleDocumentHtml(sale: Awaited<ReturnType<typeof getSalePrintable>>, mode: "sale" | "work-order") {
  const showPrices = mode === "sale";
  const lineRows = sale.lines.map((line, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${line.sku.code}</td>
      <td>${line.sku.name}</td>
      <td>${line.roomAreaName ?? "—"}</td>
      <td>${Number(line.requestedWidthM)} x ${Number(line.requestedHeightM)}</td>
      <td>${line.quantity}</td>
      <td>${line.lineNote ?? "—"}</td>
      ${showPrices ? `<td>${Number(line.unitPrice).toLocaleString()}</td><td>${Number(line.discountPct)}%</td><td>${Number(line.lineTotal).toLocaleString()}</td>` : ""}
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${mode === "sale" ? "Venta" : "Orden de trabajo"} ${sale.quoteNumber}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, sans-serif; color: #111; }
  h1, h2, p { margin: 0 0 8px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; vertical-align: top; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .meta-card { border: 1px solid #ddd; padding: 10px; }
  .totals { margin-top: 16px; margin-left: auto; width: 320px; }
</style>
</head>
<body>
  <h1>${mode === "sale" ? "Venta" : "Orden de trabajo"} COT-${sale.quoteNumber}</h1>
  <div class="meta">
    <div class="meta-card">
      <p><strong>Sucursal:</strong> ${sale.branch.name}</p>
      <p><strong>Cliente:</strong> ${sale.customer?.fullName ?? sale.customerName ?? "—"}</p>
      <p><strong>Teléfono:</strong> ${sale.customer?.phone ?? "—"}</p>
      <p><strong>Email:</strong> ${sale.customer?.email ?? "—"}</p>
      <p><strong>Referencia:</strong> ${sale.customer?.companyOrReference ?? sale.customerReference ?? "—"}</p>
    </div>
    <div class="meta-card">
      <p><strong>Estado:</strong> ${sale.status}</p>
      <p><strong>Lista:</strong> ${sale.priceList.name}</p>
      <p><strong>Descuento fuente:</strong> ${sale.discountSource}</p>
      <p><strong>Código aplicado:</strong> ${sale.discountCodeApplied ?? "—"}</p>
      <p><strong>Descuento %:</strong> ${Number(sale.discountPctApplied)}%</p>
      <p><strong>Fecha:</strong> ${sale.createdAt.toISOString().slice(0, 10)}</p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>SKU</th><th>Tela</th><th>Ambiente</th><th>Medida</th><th>Cant.</th><th>Nota</th>
        ${showPrices ? "<th>Precio</th><th>Desc.</th><th>Total</th>" : ""}
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>
  ${showPrices ? `<div class="totals">
    <p><strong>Subtotal:</strong> ${Number(sale.subtotalAmount).toLocaleString()}</p>
    <p><strong>IVA:</strong> ${Number(sale.taxAmount).toLocaleString()}</p>
    <p><strong>Total:</strong> ${Number(sale.totalAmount).toLocaleString()}</p>
    <p><strong>Abonado:</strong> ${Number(sale.amountPaid).toLocaleString()}</p>
    <p><strong>Saldo:</strong> ${Number(sale.balanceDue).toLocaleString()}</p>
  </div>` : ""}
</body>
</html>`;
}

function renderSaleDocumentZpl(sale: Awaited<ReturnType<typeof getSalePrintable>>, mode: "sale" | "work-order") {
  const lines = sale.lines.slice(0, 8).map((line, index) =>
    `^FO40,${140 + index * 36}^A0N,24,24^FD${zplSafe(index + 1)} ${zplSafe(line.sku.code)} ${zplSafe(`${Number(line.requestedWidthM)}x${Number(line.requestedHeightM)}`)} ${zplSafe(line.roomAreaName ?? "")}^FS`
  ).join("\n");
  const totals = mode === "sale"
    ? `^FO40,470^A0N,24,24^FDSubtotal ${zplSafe(Number(sale.subtotalAmount).toLocaleString())}^FS
^FO40,505^A0N,24,24^FDTotal ${zplSafe(Number(sale.totalAmount).toLocaleString())}^FS`
    : "";
  return `^XA
^PW800
^LL700
^FO40,30^A0N,32,32^FD${mode === "sale" ? "VENTA" : "ORDEN DE TRABAJO"} COT-${sale.quoteNumber}^FS
^FO40,70^A0N,24,24^FDCliente ${zplSafe(sale.customer?.fullName ?? sale.customerName ?? "-")}^FS
^FO40,105^A0N,24,24^FDRef ${zplSafe(sale.customer?.companyOrReference ?? sale.customerReference ?? "-")}^FS
${lines}
${totals}
^XZ`;
}

function zplSafe(value: unknown) {
  return String(value ?? "").replace(/[\^~]/g, " ");
}
