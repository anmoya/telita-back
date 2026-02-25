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
  linearMeters: number;
  subtotal: number;
  totalRounded: number;
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
      throw new Error("Quote context not found (branch/user/sku/price-list).");
    }

    if (input.requestedWidthM > context.skuWidthM) {
      throw new Error("Requested width exceeds SKU width.");
    }
    if (input.requestedHeightM <= 0 || input.requestedWidthM <= 0 || input.quantity <= 0) {
      throw new Error("Invalid dimensions or quantity.");
    }

    const now = this.clock.now();
    const linearMeters = input.requestedHeightM * input.quantity;
    const subtotal = roundCurrency(linearMeters * context.unitPrice);
    const totalRounded = roundClpCash(subtotal);
    const { quoteId } = await this.priceRepository.saveQuote({
      branchId: context.branchId,
      createdBy: context.createdBy,
      skuId: context.skuId,
      priceListId: context.priceListId,
      currencyCode: context.currencyCode,
      requestedWidthM: input.requestedWidthM,
      requestedHeightM: input.requestedHeightM,
      quantity: input.quantity,
      unitPrice: context.unitPrice,
      linearMeters,
      subtotalAmount: subtotal,
      totalRounded,
      createdAt: now
    });

    return {
      quoteId,
      currencyCode: context.currencyCode,
      unitPrice: context.unitPrice,
      linearMeters,
      subtotal,
      totalRounded
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
