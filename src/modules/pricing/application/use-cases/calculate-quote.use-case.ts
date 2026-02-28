import type { ClockPort } from "../../../../shared/application/ports/clock.port";
import type { PriceRepositoryPort } from "../ports/price-repository.port";

export interface CalculateQuoteInput {
  branchCode: string;
  createdByEmail: string;
  skuCode: string;
  priceListName: string;
  requestedWidthM: number;
  requestedHeightM: number;
  quantity: number;
}

export interface CalculateQuoteOutput {
  quoteId: string;
  currencyCode: string;
  unitPrice: number;
  linearMeters?: number; // only for LINEAR_METER
  subtotal: number;
  totalRounded: number;
  priceMethod: "LINEAR_METER" | "TABLE_LOOKUP";
}

export class CalculateQuoteUseCase {
  constructor(
    private readonly clock: ClockPort,
    private readonly priceRepository: PriceRepositoryPort
  ) {}

  async execute(input: CalculateQuoteInput): Promise<CalculateQuoteOutput> {
    const context = await this.priceRepository.getQuoteContext({
      branchCode: input.branchCode,
      createdByEmail: input.createdByEmail,
      skuCode: input.skuCode,
      priceListName: input.priceListName
    });
    if (!context) {
      throw new Error("Contexto de cotización no encontrado (sucursal/usuario/SKU/lista de precios).");
    }

    if (input.requestedWidthM > context.skuWidthM) {
      throw new Error("El ancho solicitado supera el ancho del SKU.");
    }
    if (input.requestedHeightM <= 0 || input.requestedWidthM <= 0 || input.quantity <= 0) {
      throw new Error("Dimensiones o cantidad inválidas.");
    }

    // SPEC-31: Try to find cell for TABLE_LOOKUP
    const cellPrice = await this.priceRepository.getCellPrice({
      priceListId: context.priceListId,
      skuId: context.skuId,
      requestedWidthM: input.requestedWidthM,
      requestedHeightM: input.requestedHeightM
    });

    const now = this.clock.now();
    let unitPrice = context.unitPrice;
    let linearMeters = 0;
    let priceMethod: "LINEAR_METER" | "TABLE_LOOKUP" = "LINEAR_METER";
    let subtotal: number;

    if (cellPrice) {
      // TABLE_LOOKUP: use fixed cell price
      priceMethod = "TABLE_LOOKUP";
      unitPrice = cellPrice.unitPrice;
      subtotal = roundCurrency(unitPrice * input.quantity);
    } else {
      // LINEAR_METER: use linear calculation
      linearMeters = input.requestedHeightM * input.quantity;
      subtotal = roundCurrency(linearMeters * unitPrice);
    }

    // SPEC-32: Apply discountPct from price_list_item
    const effectivePrice = subtotal * (1 - context.discountPct / 100);
    const totalRounded = roundClpCash(effectivePrice);

    const { quoteId } = await this.priceRepository.saveQuote({
      branchId: context.branchId,
      createdBy: context.createdBy,
      skuId: context.skuId,
      priceListId: context.priceListId,
      currencyCode: context.currencyCode,
      requestedWidthM: input.requestedWidthM,
      requestedHeightM: input.requestedHeightM,
      quantity: input.quantity,
      unitPrice,
      linearMeters,
      subtotalAmount: subtotal,
      totalRounded,
      createdAt: now
    });

    return {
      quoteId,
      currencyCode: context.currencyCode,
      unitPrice,
      linearMeters: priceMethod === "LINEAR_METER" ? linearMeters : undefined,
      subtotal,
      totalRounded,
      priceMethod
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
