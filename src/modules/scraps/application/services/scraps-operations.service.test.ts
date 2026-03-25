import assert from "node:assert/strict";
import test from "node:test";
import { ScrapsOperationsService } from "./scraps-operations.service";

test("ScrapsOperationsService delegates quote registration to scraps repository", async () => {
  let captured: Record<string, unknown> | null = null;
  const repo = {
    async registerFromQuote(input: Record<string, unknown>) {
      captured = input;
      return { id: "scrap-1" };
    }
  };

  const service = new ScrapsOperationsService(repo as never);

  const result = await service.registerFromQuote({
    quoteId: "quote-1",
    generatedByEmail: "ana@telita.cl"
  });

  assert.deepEqual(result, { id: "scrap-1" });
  assert.deepEqual(captured, {
    quoteId: "quote-1",
    generatedByEmail: "ana@telita.cl"
  });
});

test("ScrapsOperationsService delegates soft hold release", async () => {
  let captured: Record<string, unknown> | null = null;
  const repo = {
    async releaseSoftHold(input: Record<string, unknown>) {
      captured = input;
      return { ok: true };
    }
  };

  const service = new ScrapsOperationsService(repo as never);

  await service.releaseSoftHold({
    scrapId: "scrap-1",
    releasedByEmail: "ana@telita.cl"
  });

  assert.deepEqual(captured, {
    scrapId: "scrap-1",
    releasedByEmail: "ana@telita.cl"
  });
});
