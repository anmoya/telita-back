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
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";
import { prismaClient } from "../../../../shared/infrastructure/persistence/prisma-client";
import {
  AllocateScrapDto,
  CommitAutoScrapAssignmentDto,
  CancelSaleDto,
  CreateSaleDraftDto,
  CreateSaleFromQuoteDto,
  OfferPreviewDto,
  PickListDto,
  SaleLineMutationDto,
  UpdatePaymentSummaryDto,
  UpdateSaleCustomerDto
} from "../dto/sales.dto";

@Controller("sales")
export class SalesController {
  constructor(
    private readonly repo: PrismaSalesRepository,
    private readonly scrapsRepo: PrismaScrapsRepository,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  @Post("from-quote")
  @HttpCode(HttpStatus.OK)
  async createFromQuote(
    @Body() body: CreateSaleFromQuoteDto,
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
    @Body() body: CreateSaleDraftDto,
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
    @Body() body: SaleLineMutationDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.addLine(saleId, {
        skuCode: body.skuCode,
        requestedWidthM: body.requestedWidthM,
        requestedHeightM: body.requestedHeightM,
        quantity: body.quantity,
        roomAreaName: body.roomAreaName ?? undefined,
        categoryId: body.categoryId ?? undefined,
        categoryName: body.categoryName ?? undefined,
        displayOrder: body.displayOrder,
        lineNote: body.lineNote ?? undefined,
        createdByEmail: auth.email
      });
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
    @Body() body: CancelSaleDto,
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
    @Param("saleId") saleId: string,
    @Param("saleLineId") saleLineId: string,
    @Body() body: AllocateScrapDto,
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

  @Get(":saleId/lines/:saleLineId/compatible-scraps")
  async listCompatibleScraps(
    @Param("saleId") saleId: string,
    @Param("saleLineId") saleLineId: string,
    @Query("limit") limit = "5",
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      return await this.scrapsRepo.matchForSaleLine({
        saleId,
        saleLineId,
        limit: Number(limit) > 0 ? Number(limit) : 5
      });
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post(":saleId/lines/:saleLineId/pieces/:pieceId/allocate-scrap")
  async allocateScrapToPiece(
    @Param("saleId") _saleId: string,
    @Param("saleLineId") saleLineId: string,
    @Param("pieceId") pieceId: string,
    @Body() body: AllocateScrapDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.scrapsRepo.allocateToSaleLinePiece({
        saleLineId,
        saleLinePieceId: pieceId,
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

  @Delete(":saleId/lines/:saleLineId/pieces/:pieceId/allocate-scrap")
  async releasePieceAllocation(
    @Param("saleId") _saleId: string,
    @Param("saleLineId") saleLineId: string,
    @Param("pieceId") pieceId: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.scrapsRepo.releasePieceAllocation({
        saleLineId,
        saleLinePieceId: pieceId,
        releasedByEmail: auth.email
      });
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Patch(":saleId")
  async updateCustomer(
    @Param("saleId") saleId: string,
    @Body() body: UpdateSaleCustomerDto,
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
    @Body() body: UpdatePaymentSummaryDto,
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

  @Patch(":saleId/lines/:saleLineId")
  async updateLine(
    @Param("saleId") saleId: string,
    @Param("saleLineId") saleLineId: string,
    @Body() body: SaleLineMutationDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.updateLine(saleId, saleLineId, auth.email, body);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Delete(":saleId/lines/:saleLineId")
  async removeLine(
    @Param("saleId") saleId: string,
    @Param("saleLineId") saleLineId: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      await this.repo.removeLine(saleId, saleLineId, auth.email);
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
      commercialAdjustmentPct: Number(sale.commercialAdjustmentPct),
      commercialAdjustmentAmount: Number(sale.commercialAdjustmentAmount),
      installationAmount: Number(sale.installationAmount),
      subtotalAmount: Number(sale.subtotalAmount),
      taxAmount: Number(sale.taxAmount),
      totalAmount: Number(sale.totalAmount),
      amountPaid: Number(sale.amountPaid),
      balanceDue: Number(sale.balanceDue),
      lines: sale.lines.map((line) => {
        const allocatedPieces = line.pieces
          .map((piece) => {
            const allocation = piece.allocations[0];
            if (!allocation) return null;
            return {
              scrapId: allocation.scrapId,
              locationCode: allocation.scrap.location?.code ?? null
            };
          })
          .filter((value): value is { scrapId: string; locationCode: string | null } => Boolean(value));

        return {
          id: line.id,
          skuCode: line.sku.code,
          quantity: line.quantity,
          requestedWidthM: Number(line.requestedWidthM),
          requestedHeightM: Number(line.requestedHeightM),
          unitPrice: Number(line.unitPrice),
          lineTotal: Number(line.lineTotal),
          allocatedScrapId: allocatedPieces[0]?.scrapId ?? null,
          allocatedScrapPositions: allocatedPieces
            .map((piece) => piece.locationCode)
            .filter((locationCode): locationCode is string => Boolean(locationCode)),
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
            roomAreaName: piece.roomAreaName ?? null,
            allocation: piece.allocations[0]
              ? {
                  scrapId: piece.allocations[0].scrapId,
                  locationCode: piece.allocations[0].scrap.location?.code ?? null
                }
              : null
          }))
        };
      })
    }));
  }

  @Post(":saleId/compatible-scraps/offer-preview")
  async offerPreview(
    @Param("saleId") saleId: string,
    @Body() body: OfferPreviewDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const result = await this.scrapsRepo.matchForSaleLines({
        saleId,
        lineIds: body.lineIds,
        limitPerLine: body.limitPerLine ?? 3
      });

      const user = await prismaClient.appUser.findUnique({ where: { email: auth.email } });
      if (user) {
        await this.auditRepo.log({
          actorUserId: user.id,
          entityType: "sale",
          entityId: saleId,
          action: "STATUS_CHANGE",
          afterJson: {
            event: "SCRAP_OFFER_PREVIEW_CREATED",
            linesChecked: result.lines.length,
            suggestionsFound: result.lines.reduce((acc, l) => acc + l.suggestions.length, 0)
          }
        });
      }

      return result;
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post(":saleId/auto-scrap-assignment/preview")
  async previewAutoScrapAssignment(
    @Param("saleId") saleId: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const result = await this.scrapsRepo.previewAutoAssignment({ saleId });
      const user = await prismaClient.appUser.findUnique({ where: { email: auth.email } });
      if (user) {
        await this.auditRepo.log({
          actorUserId: user.id,
          entityType: "sale",
          entityId: saleId,
          action: "STATUS_CHANGE",
          afterJson: {
            event: "AUTO_SCRAP_ASSIGNMENT_PREVIEW_CREATED",
            assignedPieces: result.summary.assignedPieces,
            unmatchedPieces: result.summary.unmatchedPieces
          }
        });
      }
      return result;
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post(":saleId/auto-scrap-assignment/commit")
  async commitAutoScrapAssignment(
    @Param("saleId") saleId: string,
    @Body() body: CommitAutoScrapAssignmentDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      return await this.scrapsRepo.commitAutoAssignment({
        saleId,
        allocatedByEmail: auth.email,
        items: body.items
      });
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post(":saleId/compatible-scraps/pick-list")
  @Header("Content-Type", "text/html; charset=utf-8")
  async pickList(
    @Param("saleId") saleId: string,
    @Body() body: PickListDto,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const sale = await prismaClient.sale.findUnique({
        where: { id: saleId },
        include: { branch: true, customer: true }
      });
      if (!sale) throw new BadRequestException("Venta no encontrada.");

      const pickItems: Array<{
        lineIndex: number;
        skuCode: string;
        requestedWidthM: number;
        requestedHeightM: number;
        scrapWidthM: number;
        scrapHeightM: number;
        locationCode: string;
        labelCode: string;
      }> = [];

      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i];
        const line = await prismaClient.saleLine.findUnique({
          where: { id: item.saleLineId },
          include: { sku: true }
        });
        const scrap = await prismaClient.scrap.findUnique({
          where: { id: item.scrapId },
          include: { location: true }
        });
        if (!line || !scrap) continue;

        const labelRecord = await prismaClient.label.findFirst({
          where: { scrapId: scrap.id },
          select: { id: true }
        });

        pickItems.push({
          lineIndex: i + 1,
          skuCode: line.sku.code,
          requestedWidthM: Number(line.requestedWidthM),
          requestedHeightM: Number(line.requestedHeightM),
          scrapWidthM: Number(scrap.widthM),
          scrapHeightM: Number(scrap.heightM),
          locationCode: scrap.location?.code ?? "Sin ubicación",
          labelCode: labelRecord?.id.slice(0, 8) ?? scrap.id.slice(0, 8)
        });
      }

      const user = await prismaClient.appUser.findUnique({ where: { email: auth.email } });
      if (user) {
        await this.auditRepo.log({
          actorUserId: user.id,
          entityType: "sale",
          entityId: saleId,
          action: "STATUS_CHANGE",
          afterJson: {
            event: "SCRAP_PICK_LIST_CREATED",
            itemCount: pickItems.length
          }
        });
      }

      const html = renderPickListHtml(sale, pickItems);
      return new StreamableFile(Buffer.from(html, "utf-8"), { type: "text/html; charset=utf-8" });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get(":saleId/print/sale/html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async printSaleHtml(@Param("saleId") saleId: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const sale = await this.repo.getPrintableSale(saleId);
    return new StreamableFile(Buffer.from(renderSaleDocumentHtml(sale, "sale"), "utf-8"), { type: "text/html; charset=utf-8" });
  }

  @Get(":saleId/print/work-order/html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async printWorkOrderHtml(@Param("saleId") saleId: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const sale = await this.repo.getPrintableSale(saleId);
    return new StreamableFile(Buffer.from(renderSaleDocumentHtml(sale, "work-order"), "utf-8"), { type: "text/html; charset=utf-8" });
  }

  @Post(":saleId/print/cut-sheet/html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async printCutSheetHtml(
    @Param("saleId") saleId: string,
    @Body() body: { reserveSuggestedScraps?: boolean },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const cutSheet = await this.scrapsRepo.generateCutSheet({
      saleId,
      requestedByEmail: auth.email,
      reserveSuggestedScraps: Boolean(body.reserveSuggestedScraps)
    });
    return new StreamableFile(Buffer.from(renderCutSheetHtml(cutSheet), "utf-8"), { type: "text/html; charset=utf-8" });
  }

  @Get(":saleId/print/sale/zpl")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async printSaleZpl(@Param("saleId") saleId: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const sale = await this.repo.getPrintableSale(saleId);
    return new StreamableFile(Buffer.from(renderSaleDocumentZpl(sale, "sale"), "utf-8"), { type: "text/plain; charset=utf-8" });
  }

  @Get(":saleId/print/work-order/zpl")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async printWorkOrderZpl(@Param("saleId") saleId: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const sale = await this.repo.getPrintableSale(saleId);
    return new StreamableFile(Buffer.from(renderSaleDocumentZpl(sale, "work-order"), "utf-8"), { type: "text/plain; charset=utf-8" });
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

function renderSaleDocumentHtml(sale: Awaited<ReturnType<PrismaSalesRepository["getPrintableSale"]>>, mode: "sale" | "work-order") {
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
<title>${mode === "sale" ? (sale.status === "CONFIRMED" ? "Orden de Compra" : "Venta") : "Orden de trabajo"} ${sale.quoteNumber}</title>
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
  <h1>${mode === "sale" ? (sale.status === "CONFIRMED" ? "Orden de Compra" : "Venta") : "Orden de trabajo"} COT-${sale.quoteNumber}</h1>
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
    ${Number(sale.commercialAdjustmentAmount) > 0 ? `<p><strong>Recargo comercial (${Number(sale.commercialAdjustmentPct)}%):</strong> ${Number(sale.commercialAdjustmentAmount).toLocaleString()}</p>` : ""}
    ${Number(sale.installationAmount) > 0 ? `<p><strong>Instalación:</strong> ${Number(sale.installationAmount).toLocaleString()}</p>` : ""}
    <p><strong>IVA:</strong> ${Number(sale.taxAmount).toLocaleString()}</p>
    <p><strong>Total:</strong> ${Number(sale.totalAmount).toLocaleString()}</p>
    <p><strong>Abonado:</strong> ${Number(sale.amountPaid).toLocaleString()}</p>
    <p><strong>Saldo:</strong> ${Number(sale.balanceDue).toLocaleString()}</p>
  </div>` : ""}
</body>
</html>`;
}

function renderSaleDocumentZpl(sale: Awaited<ReturnType<PrismaSalesRepository["getPrintableSale"]>>, mode: "sale" | "work-order") {
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
^FO40,30^A0N,32,32^FD${mode === "sale" ? (sale.status === "CONFIRMED" ? "ORDEN DE COMPRA" : "VENTA") : "ORDEN DE TRABAJO"} COT-${sale.quoteNumber}^FS
^FO40,70^A0N,24,24^FDCliente ${zplSafe(sale.customer?.fullName ?? sale.customerName ?? "-")}^FS
^FO40,105^A0N,24,24^FDRef ${zplSafe(sale.customer?.companyOrReference ?? sale.customerReference ?? "-")}^FS
${lines}
${totals}
^XZ`;
}

function zplSafe(value: unknown) {
  return String(value ?? "").replace(/[\^~]/g, " ");
}

function renderCutSheetHtml(cutSheet: Awaited<ReturnType<PrismaScrapsRepository["generateCutSheet"]>>) {
  const reuseRows = cutSheet.reuseRows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${row.skuCode}</td>
      <td>${row.skuName}</td>
      <td>${row.roomAreaName ?? "—"}</td>
      <td>${row.pieceIndex}/${row.pieceTotal}</td>
      <td>${row.requestedWidthM} x ${row.requestedHeightM}</td>
      <td>${row.labelCode}</td>
      <td>${row.scrapWidthM} x ${row.scrapHeightM}</td>
      <td>${row.locationCode ?? "—"}</td>
      <td>${row.stateLabel}</td>
    </tr>
  `).join("");

  const cutRows = cutSheet.cutRows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${row.skuCode}</td>
      <td>${row.skuName}</td>
      <td>${row.roomAreaName ?? "—"}</td>
      <td>${row.pieceIndex}/${row.pieceTotal}</td>
      <td>${row.requestedWidthM} x ${row.requestedHeightM}</td>
      <td>${row.reason}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Hoja de corte ${cutSheet.quoteCode}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, sans-serif; color: #111; }
  h1, h2, p { margin: 0 0 8px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; vertical-align: top; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .meta-card { border: 1px solid #ddd; padding: 10px; }
  .disclaimer { margin: 10px 0; padding: 10px; border: 1px solid #e5c07b; background: #fff8e8; }
  .section { margin-top: 18px; }
</style>
</head>
<body>
  <h1>Hoja de corte ${cutSheet.quoteCode}</h1>
  <div class="meta">
    <div class="meta-card">
      <p><strong>Sucursal:</strong> ${cutSheet.branchName}</p>
      <p><strong>Cliente:</strong> ${cutSheet.customerName}</p>
      <p><strong>Referencia:</strong> ${cutSheet.customerReference}</p>
    </div>
    <div class="meta-card">
      <p><strong>Fecha:</strong> ${cutSheet.generatedAt.slice(0, 10)}</p>
      <p><strong>Modo:</strong> ${cutSheet.shouldReserve ? "Reservando retazos sugeridos" : "Solo guía"}</p>
      <p><strong>Reutilizar:</strong> ${cutSheet.reuseRows.length}</p>
      <p><strong>Cortar:</strong> ${cutSheet.cutRows.length}</p>
    </div>
  </div>
  ${cutSheet.isGuideOnly ? `<div class="disclaimer"><strong>Sugerencias no reservadas.</strong> Estos retazos podrían no estar disponibles al momento del retiro.</div>` : ""}
  <div class="section">
    <h2>Retazos a reutilizar</h2>
    ${cutSheet.reuseRows.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>#</th><th>SKU</th><th>Tela</th><th>Ambiente</th><th>Pieza</th><th>Medida</th><th>Etiqueta</th><th>Retazo</th><th>Ubicación</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>${reuseRows}</tbody>
      </table>
    ` : `<p>Sin retazos sugeridos para reutilizar.</p>`}
  </div>
  <div class="section">
    <h2>Piezas a cortar</h2>
    ${cutSheet.cutRows.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>#</th><th>SKU</th><th>Tela</th><th>Ambiente</th><th>Pieza</th><th>Medida</th><th>Instrucción</th>
          </tr>
        </thead>
        <tbody>${cutRows}</tbody>
      </table>
    ` : `<p>No hay piezas pendientes de corte nuevo.</p>`}
  </div>
</body>
</html>`;
}

function renderPickListHtml(
  sale: { quoteNumber: number; customerName: string | null; customer: { fullName: string } | null },
  items: Array<{
    lineIndex: number;
    skuCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    scrapWidthM: number;
    scrapHeightM: number;
    locationCode: string;
    labelCode: string;
  }>
) {
  const rows = items.map((item) => `
    <tr>
      <td>${item.lineIndex}</td>
      <td>${item.skuCode}</td>
      <td>${item.requestedWidthM} x ${item.requestedHeightM}</td>
      <td>${item.scrapWidthM} x ${item.scrapHeightM}</td>
      <td class="location">${item.locationCode}</td>
      <td>${item.labelCode}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Lista de retiro - COT-${sale.quoteNumber}</title>
<style>
  @page { size: A4; margin: 12mm; }
  @media print { .no-print { display: none !important; } }
  body { font-family: Arial, sans-serif; color: #111; }
  h1 { font-size: 20px; margin: 0 0 8px 0; }
  .meta { margin-bottom: 16px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #999; padding: 10px 8px; font-size: 13px; }
  th { background: #f4f4f4; text-align: left; }
  .location { font-weight: bold; font-size: 16px; color: #1a5276; }
  .actions { margin-top: 20px; text-align: center; }
  .actions button { padding: 10px 24px; font-size: 14px; cursor: pointer; }
</style>
</head>
<body>
  <h1>Lista de retiro - COT-${sale.quoteNumber}</h1>
  <div class="meta">
    <p><strong>Cliente:</strong> ${sale.customer?.fullName ?? sale.customerName ?? "—"}</p>
    <p><strong>Fecha:</strong> ${new Date().toISOString().slice(0, 10)}</p>
    <p><strong>Piezas a buscar:</strong> ${items.length}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>SKU</th>
        <th>Medida solicitada</th>
        <th>Medida retazo</th>
        <th>Ubicación</th>
        <th>Etiqueta</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="actions no-print">
    <button onclick="window.print()">Imprimir</button>
  </div>
</body>
</html>`;
}
