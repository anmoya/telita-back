import assert from "node:assert/strict";
import test from "node:test";
import { AppValidationError } from "../../../../shared/application/errors/app-error";
import { CalculateQuoteBatchUseCase } from "./calculate-quote-batch.use-case";

test("CalculateQuoteBatchUseCase rejects empty item list", async () => {
  const priceRepository = {};
  const clock = { now: () => new Date("2026-03-23T12:00:00.000Z") };
  const useCase = new CalculateQuoteBatchUseCase(
    clock as never,
    priceRepository as never,
    priceRepository as never
  );

  await assert.rejects(
    () =>
      useCase.execute({
        branchCode: "MAIN",
        createdByEmail: "ana@telita.cl",
        priceListName: "General",
        items: []
      }),
    (error: unknown) =>
      error instanceof AppValidationError
      && /se requiere al menos un ítem/i.test(error.message)
  );
});

test("CalculateQuoteBatchUseCase returns mixed success/error lines and aggregated totals", async () => {
  const savedQuotes: Array<Record<string, unknown>> = [];

  const priceRepository = {
    async getQuoteContext(input: { skuCode: string }) {
      if (input.skuCode === "SKU-OK") {
        return {
          ok: true,
          branchId: "branch-1",
          createdBy: "user-1",
          skuId: "sku-1",
          skuWidthM: 2,
          priceListId: "pl-1",
          currencyCode: "CLP",
          unitPrice: 10000,
          discountPct: 0
        };
      }
      return {
        ok: true,
        branchId: "branch-1",
        createdBy: "user-1",
        skuId: "sku-2",
        skuWidthM: 1,
        priceListId: "pl-1",
        currencyCode: "CLP",
        unitPrice: 5000,
        discountPct: 0
      };
    },
    async getCellPrice() {
      return null;
    },
    async saveQuote(payload: Record<string, unknown>) {
      savedQuotes.push(payload);
      return { quoteId: `quote-${savedQuotes.length}` };
    }
  };

  const clock = { now: () => new Date("2026-03-23T12:00:00.000Z") };
  const useCase = new CalculateQuoteBatchUseCase(
    clock as never,
    priceRepository as never,
    priceRepository as never
  );

  const result = await useCase.execute({
    branchCode: "MAIN",
    createdByEmail: "ana@telita.cl",
    priceListName: "General",
    items: [
      {
        clientItemId: "1",
        skuCode: "SKU-OK",
        requestedWidthM: 1,
        requestedHeightM: 2,
        quantity: 2
      },
      {
        clientItemId: "2",
        skuCode: "SKU-FAIL",
        requestedWidthM: 1.5,
        requestedHeightM: 1,
        quantity: 1
      }
    ]
  });

  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0]?.ok, true);
  assert.equal(result.lines[1]?.ok, false);
  assert.equal(result.hasErrors, true);
  assert.equal(result.subtotalAmount, 40000);
  assert.equal(result.taxAmount, 7600);
  assert.equal(result.totalAmount, 47600);
  assert.equal(savedQuotes.length, 1);
});

test("CalculateQuoteBatchUseCase allows widths above SKU width when SKU width is zero", async () => {
  const savedQuotes: Array<Record<string, unknown>> = [];

  const priceRepository = {
    async getQuoteContext() {
      return {
        ok: true,
        branchId: "branch-1",
        createdBy: "user-1",
        skuId: "sku-open",
        skuWidthM: 0,
        priceListId: "pl-1",
        currencyCode: "CLP",
        unitPrice: 5000,
        discountPct: 0
      };
    },
    async getCellPrice() {
      return null;
    },
    async saveQuote(payload: Record<string, unknown>) {
      savedQuotes.push(payload);
      return { quoteId: `quote-${savedQuotes.length}` };
    }
  };

  const clock = { now: () => new Date("2026-03-23T12:00:00.000Z") };
  const useCase = new CalculateQuoteBatchUseCase(
    clock as never,
    priceRepository as never,
    priceRepository as never
  );

  const result = await useCase.execute({
    branchCode: "MAIN",
    createdByEmail: "ana@telita.cl",
    priceListName: "General",
    items: [
      {
        clientItemId: "1",
        skuCode: "SKU-OPEN",
        requestedWidthM: 4.2,
        requestedHeightM: 1.5,
        quantity: 2
      }
    ]
  });

  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0]?.ok, true);
  assert.equal(result.hasErrors, false);
  assert.equal(savedQuotes.length, 1);
  assert.equal(savedQuotes[0].requestedWidthM, 4.2);
});
