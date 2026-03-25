import assert from "node:assert/strict";
import test from "node:test";
import { SalesOperationsService } from "./sales-operations.service";

test("SalesOperationsService delegates line scrap allocation to scraps repository", async () => {
  let captured: Record<string, unknown> | null = null;

  const salesRepo = {};
  const scrapsRepo = {
    async allocateToSaleLine(input: Record<string, unknown>) {
      captured = input;
      return { ok: true };
    }
  };

  const service = new SalesOperationsService(salesRepo as never, scrapsRepo as never);

  await service.allocateScrapToLine({
    saleLineId: "line-1",
    scrapId: "scrap-1",
    allocatedByEmail: "ana@telita.cl"
  });

  assert.deepEqual(captured, {
    saleLineId: "line-1",
    scrapId: "scrap-1",
    allocatedByEmail: "ana@telita.cl"
  });
});

test("SalesOperationsService delegates listCutJobs to sales repository", async () => {
  const expected = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
  let captured: Record<string, unknown> | null = null;

  const salesRepo = {
    async listCutJobs(input: Record<string, unknown>) {
      captured = input;
      return expected;
    }
  };

  const scrapsRepo = {};
  const service = new SalesOperationsService(salesRepo as never, scrapsRepo as never);

  const result = await service.listCutJobs({
    branchCode: "MAIN",
    status: "PENDING",
    page: 1,
    limit: 20
  });

  assert.equal(result, expected);
  assert.deepEqual(captured, {
    branchCode: "MAIN",
    status: "PENDING",
    page: 1,
    limit: 20
  });
});
