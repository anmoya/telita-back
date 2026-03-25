import { Inject, Injectable } from "@nestjs/common";
import { SystemClockService } from "../../../../shared/infrastructure/time/system-clock.service";
import { QUOTE_REPOSITORY, type QuoteRepositoryPort } from "../ports/price-repository.port";
import { CalculateQuoteBatchUseCase } from "./calculate-quote-batch.use-case";

export interface BuildQuotePreviewInput {
  mode: "CUSTOMER" | "INTERNAL";
  branchCode: string;
  priceListName: string;
  customerName?: string;
  customerReference?: string;
  commercialAdjustmentPct?: number;
  installationAmount?: number;
  createdByEmail: string;
  actorRole: string;
  items: Array<{
    skuCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    quantity: number;
    description?: string;
    categoryName?: string;
    roomAreaName?: string;
  }>;
}

@Injectable()
export class BuildQuotePreviewUseCase {
  constructor(
    private readonly clock: SystemClockService,
    @Inject(QUOTE_REPOSITORY)
    private readonly priceRepo: QuoteRepositoryPort,
    private readonly quoteBatchUseCase: CalculateQuoteBatchUseCase
  ) {}

  async execute(input: BuildQuotePreviewInput) {
    const batch = await this.quoteBatchUseCase.execute({
      branchCode: input.branchCode,
      priceListName: input.priceListName,
      createdByEmail: input.createdByEmail,
      items: input.items.map((item, index) => ({
        clientItemId: String(index),
        skuCode: item.skuCode,
        requestedWidthM: item.requestedWidthM,
        requestedHeightM: item.requestedHeightM,
        quantity: item.quantity,
        description: item.description
      }))
    });

    const branch = await this.priceRepo.getBranchSummaryByCode(input.branchCode);

    const lines = input.items
      .map((item, index) => {
        const line = batch.lines[index];
        if (!line) {
          return null;
        }

        if (!line.ok) {
          return {
            index,
            skuCode: item.skuCode,
            error: line.error
          };
        }

        return {
          index,
          skuCode: item.skuCode,
          description: item.description ?? item.skuCode,
          categoryName: item.categoryName ?? null,
          roomAreaName: item.roomAreaName ?? null,
          requestedWidthM: item.requestedWidthM,
          requestedHeightM: item.requestedHeightM,
          quantity: item.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          priceMethod: line.priceMethod,
          ...(input.mode === "INTERNAL" ? { linearMeters: line.linearMeters } : {})
        };
      })
      .filter(Boolean);

    const commercialAdjustmentPct = Math.min(Math.max(input.commercialAdjustmentPct ?? 0, 0), 100);
    const commercialAdjustmentAmount = roundCurrency(batch.subtotalAmount * (commercialAdjustmentPct / 100));
    const installationAmount = Math.max(input.installationAmount ?? 0, 0);
    const taxableSubtotal = batch.subtotalAmount + commercialAdjustmentAmount + installationAmount;
    const tax = roundCurrency(taxableSubtotal * 0.19);
    const total = roundClpCash(taxableSubtotal + tax);

    const result: Record<string, unknown> = {
      header: {
        branchName: branch?.name ?? input.branchCode,
        date: this.clock.now().toISOString(),
        priceListName: input.priceListName
      },
      customer: {
        name: input.customerName ?? null,
        reference: input.customerReference ?? null
      },
      lines,
      totals: {
        subtotal: batch.subtotalAmount,
        commercialAdjustmentPct,
        commercialAdjustmentAmount,
        installationAmount,
        tax,
        total,
        currencyCode: batch.currencyCode
      },
      hasErrors: batch.hasErrors
    };

    if (input.mode === "INTERNAL") {
      result.internalBreakdown = {
        role: input.actorRole,
        lineDetails: lines
      };
    }

    return result;
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
