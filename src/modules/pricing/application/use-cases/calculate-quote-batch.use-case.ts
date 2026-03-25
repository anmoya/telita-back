import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { SystemClockService } from "../../../../shared/infrastructure/time/system-clock.service";
import { PRICE_CELL_REPOSITORY, QUOTE_REPOSITORY, type PriceCellRepositoryPort, type QuoteRepositoryPort } from "../ports/price-repository.port";

export interface QuoteBatchItem {
  clientItemId: string;
  skuCode: string;
  requestedWidthM: number;
  requestedHeightM: number;
  quantity: number;
  description?: string;
}

export interface QuoteBatchInput {
  branchCode: string;
  createdByEmail: string;
  priceListName: string;
  items: QuoteBatchItem[];
}

export interface QuoteBatchLineSuccess {
  clientItemId: string;
  skuCode: string;
  quoteId: string;
  unitPrice: number;
  linearMeters?: number;
  subtotal: number;
  totalRounded: number;
  priceMethod: "LINEAR_METER" | "TABLE_LOOKUP";
  ok: true;
}

export interface QuoteBatchLineError {
  clientItemId: string;
  skuCode: string;
  error: string;
  ok: false;
}

export type QuoteBatchLine = QuoteBatchLineSuccess | QuoteBatchLineError;

export interface QuoteBatchOutput {
  quoteBatchId: string;
  currencyCode: string;
  lines: QuoteBatchLine[];
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  hasErrors: boolean;
}

@Injectable()
export class CalculateQuoteBatchUseCase {
  constructor(
    private readonly clock: SystemClockService,
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepository: QuoteRepositoryPort,
    @Inject(PRICE_CELL_REPOSITORY)
    private readonly priceCellRepository: PriceCellRepositoryPort
  ) {}

  async execute(input: QuoteBatchInput): Promise<QuoteBatchOutput> {
    if (input.items.length === 0) {
      throw new AppValidationError("Se requiere al menos un ítem.");
    }

    // Resolve shared context (branch, user, price list currency) from first successful item
    const lines: QuoteBatchLine[] = [];
    let currencyCode = "CLP";
    const quoteBatchId = randomUUID();

    for (const item of input.items) {
      try {
        const context = await this.quoteRepository.getQuoteContext({
          branchCode: input.branchCode,
          createdByEmail: input.createdByEmail,
          skuCode: item.skuCode,
          priceListName: input.priceListName
        });
        if (!context.ok) {
          throw new AppNotFoundError(resolveQuoteContextMessage(item.skuCode, input.priceListName, context.reason));
        }

        currencyCode = context.currencyCode;

        if (context.skuWidthM > 0 && item.requestedWidthM > context.skuWidthM) {
          throw new AppValidationError("El ancho solicitado supera el ancho del SKU.");
        }
        if (item.requestedHeightM <= 0 || item.requestedWidthM <= 0 || item.quantity <= 0) {
          throw new AppValidationError("Dimensiones o cantidad inválidas.");
        }

        const cellPrice = await this.priceCellRepository.getCellPrice({
          priceListId: context.priceListId,
          skuId: context.skuId,
          requestedWidthM: item.requestedWidthM,
          requestedHeightM: item.requestedHeightM
        });

        const now = this.clock.now();
        let unitPrice = context.unitPrice;
        let linearMeters = 0;
        let priceMethod: "LINEAR_METER" | "TABLE_LOOKUP" = "LINEAR_METER";
        let grossSubtotal: number;

        if (cellPrice) {
          priceMethod = "TABLE_LOOKUP";
          unitPrice = cellPrice.unitPrice;
          grossSubtotal = roundCurrency(unitPrice * item.quantity);
        } else {
          linearMeters = item.requestedHeightM * item.quantity;
          grossSubtotal = roundCurrency(linearMeters * unitPrice);
        }

        const subtotal = roundCurrency(grossSubtotal * (1 - context.discountPct / 100));
        const totalRounded = roundClpCash(subtotal);

        const { quoteId } = await this.quoteRepository.saveQuote({
          branchId: context.branchId,
          createdBy: context.createdBy,
          skuId: context.skuId,
          priceListId: context.priceListId,
          currencyCode: context.currencyCode,
          requestedWidthM: item.requestedWidthM,
          requestedHeightM: item.requestedHeightM,
          quantity: item.quantity,
          unitPrice,
          linearMeters,
          subtotalAmount: subtotal,
          totalRounded,
          createdAt: now
        });

        lines.push({
          clientItemId: item.clientItemId,
          skuCode: item.skuCode,
          quoteId,
          unitPrice,
          linearMeters: priceMethod === "LINEAR_METER" ? linearMeters : undefined,
          subtotal,
          totalRounded,
          priceMethod,
          ok: true
        });
      } catch (err) {
        lines.push({
          clientItemId: item.clientItemId,
          skuCode: item.skuCode,
          error: err instanceof Error ? err.message : "Error desconocido",
          ok: false
        });
      }
    }

    const successLines = lines.filter((l): l is QuoteBatchLineSuccess => l.ok);
    const subtotalAmount = roundCurrency(successLines.reduce((sum, l) => sum + l.subtotal, 0));
    const taxAmount = roundCurrency(subtotalAmount * 0.19);
    const totalAmount = roundClpCash(subtotalAmount + taxAmount);
    const hasErrors = lines.some((l) => !l.ok);

    return {
      quoteBatchId,
      currencyCode,
      lines,
      subtotalAmount,
      taxAmount,
      totalAmount,
      hasErrors
    };
  }
}

function resolveQuoteContextMessage(skuCode: string, priceListName: string, reason: string) {
  if (reason === "SKU_NOT_IN_PRICE_LIST") {
    return `El SKU ${skuCode} existe, pero no está agregado a la lista de precios seleccionada (${priceListName}).`;
  }
  if (reason === "SKU_NOT_FOUND") {
    return `El SKU ${skuCode} no existe o está inactivo en la sucursal seleccionada.`;
  }
  if (reason === "PRICE_LIST_NOT_FOUND") {
    return `La lista de precios seleccionada (${priceListName}) no existe o está inactiva.`;
  }
  return "No se pudo resolver el contexto de cotización.";
}

function roundClpCash(value: number): number {
  const integer = Math.round(value);
  const remainder = integer % 10;
  const base = integer - remainder;
  return remainder <= 5 ? base : base + 10;
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}
