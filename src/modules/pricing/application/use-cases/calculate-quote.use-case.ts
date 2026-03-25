import { Inject, Injectable } from "@nestjs/common";
import { AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { SystemClockService } from "../../../../shared/infrastructure/time/system-clock.service";
import { PRICE_CELL_REPOSITORY, QUOTE_REPOSITORY, type PriceCellRepositoryPort, type QuoteRepositoryPort } from "../ports/price-repository.port";

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

@Injectable()
export class CalculateQuoteUseCase {
  constructor(
    private readonly clock: SystemClockService,
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepository: QuoteRepositoryPort,
    @Inject(PRICE_CELL_REPOSITORY)
    private readonly priceCellRepository: PriceCellRepositoryPort
  ) {}

  async execute(input: CalculateQuoteInput): Promise<CalculateQuoteOutput> {
    const context = await this.quoteRepository.getQuoteContext({
      branchCode: input.branchCode,
      createdByEmail: input.createdByEmail,
      skuCode: input.skuCode,
      priceListName: input.priceListName
    });
    if (!context.ok) {
      throw new AppNotFoundError(resolveQuoteContextMessage(input.skuCode, input.priceListName, context.reason));
    }

    if (context.skuWidthM > 0 && input.requestedWidthM > context.skuWidthM) {
      throw new AppValidationError("El ancho solicitado supera el ancho del SKU.");
    }
    if (input.requestedHeightM <= 0 || input.requestedWidthM <= 0 || input.quantity <= 0) {
      throw new AppValidationError("Dimensiones o cantidad inválidas.");
    }

    // SPEC-31: Try to find cell for TABLE_LOOKUP
    const cellPrice = await this.priceCellRepository.getCellPrice({
      priceListId: context.priceListId,
      skuId: context.skuId,
      requestedWidthM: input.requestedWidthM,
      requestedHeightM: input.requestedHeightM
    });

    const now = this.clock.now();
    let unitPrice = context.unitPrice;
    let linearMeters = 0;
    let priceMethod: "LINEAR_METER" | "TABLE_LOOKUP" = "LINEAR_METER";
    let grossSubtotal: number;

    if (cellPrice) {
      // TABLE_LOOKUP: use fixed cell price
      priceMethod = "TABLE_LOOKUP";
      unitPrice = cellPrice.unitPrice;
      grossSubtotal = roundCurrency(unitPrice * input.quantity);
    } else {
      // LINEAR_METER: use linear calculation
      linearMeters = input.requestedHeightM * input.quantity;
      grossSubtotal = roundCurrency(linearMeters * unitPrice);
    }

    // SPEC-32: Apply discountPct from price_list_item
    const subtotal = roundCurrency(grossSubtotal * (1 - context.discountPct / 100));
    const totalRounded = roundClpCash(subtotal);

    const { quoteId } = await this.quoteRepository.saveQuote({
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
