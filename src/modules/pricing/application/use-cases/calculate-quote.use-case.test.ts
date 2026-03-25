import assert from "node:assert/strict";
import test from "node:test";
import { AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { CalculateQuoteUseCase } from "./calculate-quote.use-case";

test("CalculateQuoteUseCase uses table lookup price when cell exists", async () => {
  const savedQuotes: Array<Record<string, unknown>> = [];

  const priceRepository = {
    async getQuoteContext() {
      return {
        ok: true,
        branchId: "branch-1",
        createdBy: "user-1",
        skuId: "sku-1",
        skuWidthM: 2,
        priceListId: "pl-1",
        currencyCode: "CLP",
        unitPrice: 15000,
        discountPct: 10
      };
    },
    async getCellPrice() {
      return { unitPrice: 25000 };
    },
    async saveQuote(payload: Record<string, unknown>) {
      savedQuotes.push(payload);
      return { quoteId: "quote-1" };
    }
  };

  const clock = {
    now() {
      return new Date("2026-03-23T10:00:00.000Z");
    }
  };

  const useCase = new CalculateQuoteUseCase(
    clock as never,
    priceRepository as never,
    priceRepository as never
  );

  const result = await useCase.execute({
    branchCode: "MAIN",
    createdByEmail: "ana@telita.cl",
    skuCode: "SKU-1",
    priceListName: "General",
    requestedWidthM: 1.5,
    requestedHeightM: 1.2,
    quantity: 2
  });

  assert.deepEqual(result, {
    quoteId: "quote-1",
    currencyCode: "CLP",
    unitPrice: 25000,
    linearMeters: undefined,
    subtotal: 45000,
    totalRounded: 45000,
    priceMethod: "TABLE_LOOKUP"
  });

  assert.equal(savedQuotes.length, 1);
  assert.equal(savedQuotes[0].linearMeters, 0);
  assert.equal(savedQuotes[0].unitPrice, 25000);
});

test("CalculateQuoteUseCase rejects width larger than SKU width", async () => {
  const priceRepository = {
    async getQuoteContext() {
      return {
        ok: true,
        branchId: "branch-1",
        createdBy: "user-1",
        skuId: "sku-1",
        skuWidthM: 1,
        priceListId: "pl-1",
        currencyCode: "CLP",
        unitPrice: 15000,
        discountPct: 0
      };
    },
    async getCellPrice() {
      return null;
    },
    async saveQuote() {
      throw new Error("saveQuote should not be called");
    }
  };

  const clock = { now: () => new Date("2026-03-23T10:00:00.000Z") };
  const useCase = new CalculateQuoteUseCase(
    clock as never,
    priceRepository as never,
    priceRepository as never
  );

  await assert.rejects(
    () =>
      useCase.execute({
        branchCode: "MAIN",
        createdByEmail: "ana@telita.cl",
        skuCode: "SKU-1",
        priceListName: "General",
        requestedWidthM: 1.5,
        requestedHeightM: 1.2,
        quantity: 1
      }),
    (error: unknown) =>
      error instanceof AppValidationError
      && /ancho solicitado supera/i.test(error.message)
  );
});

test("CalculateQuoteUseCase allows any width when SKU width is zero", async () => {
  const savedQuotes: Array<Record<string, unknown>> = [];

  const priceRepository = {
    async getQuoteContext() {
      return {
        ok: true,
        branchId: "branch-1",
        createdBy: "user-1",
        skuId: "sku-1",
        skuWidthM: 0,
        priceListId: "pl-1",
        currencyCode: "CLP",
        unitPrice: 15000,
        discountPct: 0
      };
    },
    async getCellPrice() {
      return null;
    },
    async saveQuote(payload: Record<string, unknown>) {
      savedQuotes.push(payload);
      return { quoteId: "quote-open-width" };
    }
  };

  const clock = { now: () => new Date("2026-03-23T10:00:00.000Z") };
  const useCase = new CalculateQuoteUseCase(
    clock as never,
    priceRepository as never,
    priceRepository as never
  );

  const result = await useCase.execute({
    branchCode: "MAIN",
    createdByEmail: "ana@telita.cl",
    skuCode: "SKU-OPEN",
    priceListName: "General",
    requestedWidthM: 4.5,
    requestedHeightM: 1.2,
    quantity: 1
  });

  assert.equal(result.quoteId, "quote-open-width");
  assert.equal(savedQuotes.length, 1);
  assert.equal(savedQuotes[0].requestedWidthM, 4.5);
});

test("CalculateQuoteUseCase rejects missing pricing context with AppNotFoundError", async () => {
  const priceRepository = {
    async getQuoteContext() {
      return { ok: false, reason: "SKU_NOT_IN_PRICE_LIST" as const };
    },
    async getCellPrice() {
      return null;
    },
    async saveQuote() {
      throw new Error("saveQuote should not be called");
    }
  };

  const clock = { now: () => new Date("2026-03-23T10:00:00.000Z") };
  const useCase = new CalculateQuoteUseCase(
    clock as never,
    priceRepository as never,
    priceRepository as never
  );

  await assert.rejects(
    () =>
      useCase.execute({
        branchCode: "MAIN",
        createdByEmail: "ana@telita.cl",
        skuCode: "SKU-1",
        priceListName: "General",
        requestedWidthM: 1,
        requestedHeightM: 1,
        quantity: 1
      }),
    (error: unknown) =>
      error instanceof AppNotFoundError
      && /no está agregado a la lista de precios seleccionada/i.test(error.message)
  );
});
