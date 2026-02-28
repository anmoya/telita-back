import type { ClockPort } from "../../../../shared/application/ports/clock.port";
import type { PriceRepositoryPort } from "../ports/price-repository.port";

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

export class CalculateQuoteBatchUseCase {
  constructor(
    private readonly clock: ClockPort,
    private readonly priceRepository: PriceRepositoryPort
  ) {}

  async execute(input: QuoteBatchInput): Promise<QuoteBatchOutput> {
    if (input.items.length === 0) {
      throw new Error("Se requiere al menos un ítem.");
    }

    // Resolve shared context (branch, user, price list currency) from first successful item
    const lines: QuoteBatchLine[] = [];
    let currencyCode = "CLP";
    const quoteBatchId = crypto.randomUUID();

    for (const item of input.items) {
      try {
        const context = await this.priceRepository.getQuoteContext({
          branchCode: input.branchCode,
          createdByEmail: input.createdByEmail,
          skuCode: item.skuCode,
          priceListName: input.priceListName
        });
        if (!context) {
          throw new Error("Contexto de cotización no encontrado (sucursal/usuario/SKU/lista de precios).");
        }

        currencyCode = context.currencyCode;

        if (item.requestedWidthM > context.skuWidthM) {
          throw new Error("El ancho solicitado supera el ancho del SKU.");
        }
        if (item.requestedHeightM <= 0 || item.requestedWidthM <= 0 || item.quantity <= 0) {
          throw new Error("Dimensiones o cantidad inválidas.");
        }

        const cellPrice = await this.priceRepository.getCellPrice({
          priceListId: context.priceListId,
          skuId: context.skuId,
          requestedWidthM: item.requestedWidthM,
          requestedHeightM: item.requestedHeightM
        });

        const now = this.clock.now();
        let unitPrice = context.unitPrice;
        let linearMeters = 0;
        let priceMethod: "LINEAR_METER" | "TABLE_LOOKUP" = "LINEAR_METER";
        let subtotal: number;

        if (cellPrice) {
          priceMethod = "TABLE_LOOKUP";
          unitPrice = cellPrice.unitPrice;
          subtotal = roundCurrency(unitPrice * item.quantity);
        } else {
          linearMeters = item.requestedHeightM * item.quantity;
          subtotal = roundCurrency(linearMeters * unitPrice);
        }

        const effectivePrice = subtotal * (1 - context.discountPct / 100);
        const totalRounded = roundClpCash(effectivePrice);

        const { quoteId } = await this.priceRepository.saveQuote({
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

function roundClpCash(value: number): number {
  const integer = Math.round(value);
  const remainder = integer % 10;
  const base = integer - remainder;
  return remainder <= 5 ? base : base + 10;
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}
