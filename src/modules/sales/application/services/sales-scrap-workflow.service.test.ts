import assert from "node:assert/strict";
import test from "node:test";
import { SalesScrapWorkflowService } from "./sales-scrap-workflow.service";

test("SalesScrapWorkflowService.offerPreview audits generated suggestions", async () => {
  let auditPayload: Record<string, unknown> | null = null;

  const scrapsRepo = {
    async matchForSaleLines() {
      return {
        lines: [
          { suggestions: [{ id: "scrap-1" }, { id: "scrap-2" }] },
          { suggestions: [{ id: "scrap-3" }] }
        ]
      };
    }
  };

  const auditRepo = {
    async logByActorEmail(payload: Record<string, unknown>) {
      auditPayload = payload;
    }
  };

  const service = new SalesScrapWorkflowService(scrapsRepo as never, auditRepo as never);

  const result = await service.offerPreview({
    saleId: "sale-1",
    actorEmail: "ana@telita.cl",
    lineIds: ["line-1"],
    limitPerLine: 5
  });

  assert.equal(result.lines.length, 2);
  assert.deepEqual(auditPayload, {
    actorEmail: "ana@telita.cl",
    entityType: "sale",
    entityId: "sale-1",
    action: "STATUS_CHANGE",
    afterJson: {
      event: "SCRAP_OFFER_PREVIEW_CREATED",
      linesChecked: 2,
      suggestionsFound: 3
    }
  });
});

test("SalesScrapWorkflowService.generateCutSheet delegates reservation flag", async () => {
  let captured: Record<string, unknown> | null = null;

  const scrapsRepo = {
    async generateCutSheet(payload: Record<string, unknown>) {
      captured = payload;
      return { ok: true };
    }
  };

  const auditRepo = {};
  const service = new SalesScrapWorkflowService(scrapsRepo as never, auditRepo as never);

  const result = await service.generateCutSheet({
    saleId: "sale-1",
    actorEmail: "ana@telita.cl",
    reserveSuggestedScraps: true
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(captured, {
    saleId: "sale-1",
    requestedByEmail: "ana@telita.cl",
    reserveSuggestedScraps: true
  });
});

test("SalesScrapWorkflowService.previewAutoAssignment audits assigned and unmatched pieces", async () => {
  let auditPayload: Record<string, unknown> | null = null;

  const scrapsRepo = {
    async previewAutoAssignment() {
      return {
        summary: {
          assignedPieces: 3,
          unmatchedPieces: 1
        }
      };
    }
  };

  const auditRepo = {
    async logByActorEmail(payload: Record<string, unknown>) {
      auditPayload = payload;
    }
  };

  const service = new SalesScrapWorkflowService(scrapsRepo as never, auditRepo as never);

  const result = await service.previewAutoAssignment({
    saleId: "sale-1",
    actorEmail: "ana@telita.cl"
  });

  assert.deepEqual(result, {
    summary: {
      assignedPieces: 3,
      unmatchedPieces: 1
    }
  });

  assert.deepEqual(auditPayload, {
    actorEmail: "ana@telita.cl",
    entityType: "sale",
    entityId: "sale-1",
    action: "STATUS_CHANGE",
    afterJson: {
      event: "AUTO_SCRAP_ASSIGNMENT_PREVIEW_CREATED",
      assignedPieces: 3,
      unmatchedPieces: 1
    }
  });
});
