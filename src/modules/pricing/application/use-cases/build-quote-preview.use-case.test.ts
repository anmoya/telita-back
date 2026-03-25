import assert from "node:assert/strict";
import test from "node:test";
import { BuildQuotePreviewUseCase } from "./build-quote-preview.use-case";

test("BuildQuotePreviewUseCase builds internal preview with computed totals", async () => {
  const clock = {
    now() {
      return new Date("2026-03-23T15:00:00.000Z");
    }
  };

  const priceRepo = {
    async getBranchSummaryByCode(code: string) {
      assert.equal(code, "MAIN");
      return { name: "Casa Matriz" };
    }
  };

  const quoteBatchUseCase = {
    async execute() {
      return {
        currencyCode: "CLP",
        subtotalAmount: 1000,
        hasErrors: false,
        lines: [
          {
            ok: true,
            unitPrice: 500,
            subtotal: 1000,
            priceMethod: "LINEAR_METER",
            linearMeters: 2
          }
        ]
      };
    }
  };

  const useCase = new BuildQuotePreviewUseCase(
    clock as never,
    priceRepo as never,
    quoteBatchUseCase as never
  );

  const result = await useCase.execute({
    mode: "INTERNAL",
    branchCode: "MAIN",
    priceListName: "General",
    customerName: "Cliente Demo",
    customerReference: "Obra 1",
    commercialAdjustmentPct: 10,
    installationAmount: 50,
    createdByEmail: "ana@telita.cl",
    actorRole: "admin",
    items: [
      {
        skuCode: "SKU-1",
        requestedWidthM: 1,
        requestedHeightM: 2,
        quantity: 1,
        description: "Panel",
        categoryName: "Muros",
        roomAreaName: "Living"
      }
    ]
  });

  assert.deepEqual(result, {
    header: {
      branchName: "Casa Matriz",
      date: "2026-03-23T15:00:00.000Z",
      priceListName: "General"
    },
    customer: {
      name: "Cliente Demo",
      reference: "Obra 1"
    },
    lines: [
      {
        index: 0,
        skuCode: "SKU-1",
        description: "Panel",
        categoryName: "Muros",
        roomAreaName: "Living",
        requestedWidthM: 1,
        requestedHeightM: 2,
        quantity: 1,
        unitPrice: 500,
        subtotal: 1000,
        priceMethod: "LINEAR_METER",
        linearMeters: 2
      }
    ],
    totals: {
      subtotal: 1000,
      commercialAdjustmentPct: 10,
      commercialAdjustmentAmount: 100,
      installationAmount: 50,
      tax: 218.5,
      total: 1370,
      currencyCode: "CLP"
    },
    hasErrors: false,
    internalBreakdown: result.internalBreakdown
  });

  assert.deepEqual(result.internalBreakdown, {
    role: "admin",
    lineDetails: result.lines
  });
});
