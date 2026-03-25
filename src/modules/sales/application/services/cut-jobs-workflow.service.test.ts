import assert from "node:assert/strict";
import test from "node:test";
import { CutJobsWorkflowService } from "./cut-jobs-workflow.service";

test("CutJobsWorkflowService returns empty result when lookup policy is OFF", async () => {
  const salesRepo = {};
  const scrapsRepo = {
    async matchForCutJob() {
      throw new Error("matchForCutJob should not be called when policy is OFF");
    }
  };
  const settingsRepo = {
    async getCutScrapLookupPolicy() {
      return { mode: "OFF", scope: "BRANCH", maxSuggestionsPerLine: 3 };
    }
  };
  const auditRepo = {
    async logByActorEmail() {
      throw new Error("audit should not be called when policy is OFF");
    }
  };

  const service = new CutJobsWorkflowService(
    salesRepo as never,
    scrapsRepo as never,
    settingsRepo as never,
    auditRepo as never
  );

  const result = await service.getCompatibleScraps({
    cutJobId: "cut-1",
    actorEmail: "ana@telita.cl"
  });

  assert.deepEqual(result, {
    policy: { mode: "OFF", scope: "BRANCH", maxSuggestionsPerLine: 3 },
    saleId: null,
    cutJobId: "cut-1",
    lines: []
  });
});

test("CutJobsWorkflowService queries scraps and audits when lookup policy is ON", async () => {
  let auditPayload: Record<string, unknown> | null = null;

  const salesRepo = {};
  const scrapsRepo = {
    async matchForCutJob(payload: Record<string, unknown>) {
      assert.deepEqual(payload, {
        cutJobId: "cut-1",
        scope: "BRANCH",
        maxPerLine: 4
      });

      return {
        saleId: "sale-1",
        cutJobId: "cut-1",
        lines: [
          { suggestions: [{ id: "scrap-1" }, { id: "scrap-2" }] },
          { suggestions: [] }
        ]
      };
    }
  };
  const settingsRepo = {
    async getCutScrapLookupPolicy() {
      return { mode: "AUTO", scope: "BRANCH", maxSuggestionsPerLine: 4 };
    }
  };
  const auditRepo = {
    async logByActorEmail(payload: Record<string, unknown>) {
      auditPayload = payload;
    }
  };

  const service = new CutJobsWorkflowService(
    salesRepo as never,
    scrapsRepo as never,
    settingsRepo as never,
    auditRepo as never
  );

  const result = await service.getCompatibleScraps({
    cutJobId: "cut-1",
    actorEmail: "ana@telita.cl"
  });

  assert.deepEqual(result, {
    policy: { mode: "AUTO", scope: "BRANCH", maxSuggestionsPerLine: 4 },
    saleId: "sale-1",
    cutJobId: "cut-1",
    lines: [
      { suggestions: [{ id: "scrap-1" }, { id: "scrap-2" }] },
      { suggestions: [] }
    ]
  });

  assert.deepEqual(auditPayload, {
    actorEmail: "ana@telita.cl",
    entityType: "cut_job",
    entityId: "cut-1",
    action: "STATUS_CHANGE",
    afterJson: {
      event: "CUT_COMPATIBLE_SCRAPS_CHECKED",
      suggestionsFound: 2,
      mode: "AUTO",
      scope: "BRANCH"
    }
  });
});

test("CutJobsWorkflowService marks cut, releases holds and registers scraps", async () => {
  const released: Array<Record<string, unknown>> = [];
  const registered: Array<Record<string, unknown>> = [];

  const salesRepo = {
    async markCut() {
      return {
        id: "cut-1",
        saleLine: {
          id: "line-1",
          quantity: 1,
          requestedWidthM: 1.2,
          requestedHeightM: 2,
          sale: { branchId: "branch-1" },
          sku: {
            id: "sku-1",
            widthValue: 2,
            widthUnit: { toMeterFactor: 1 }
          },
          pieces: [
            {
              id: "piece-1",
              pieceIndex: 1,
              pieceTotal: 1,
              requestedWidthM: 1.2,
              requestedHeightM: 2,
              roomAreaName: null
            }
          ]
        }
      };
    }
  };

  const scrapsRepo = {
    async releaseSoftHoldsByCriteria(payload: Record<string, unknown>) {
      released.push(payload);
    },
    async registerFromCutJob(payload: Record<string, unknown>) {
      registered.push(payload);
      return {
        id: "scrap-1",
        status: "AVAILABLE",
        widthM: 0.8,
        heightM: 2,
        areaM2: 1.6,
        isUseful: true
      };
    }
  };

  const settingsRepo = {
    async getScrapPolicy() {
      return { locationPolicy: "AT_CUT_REQUIRE_LOCATION" };
    }
  };

  const auditRepo = {};

  const service = new CutJobsWorkflowService(
    salesRepo as never,
    scrapsRepo as never,
    settingsRepo as never,
    auditRepo as never
  );

  const result = await service.markCutAndRegisterScraps({
    cutJobId: "cut-1",
    actorEmail: "ana@telita.cl",
    defaultLocationCode: "A-01",
    pieceLocations: [{ saleLinePieceId: "piece-1", locationCode: "B-02" }]
  });

  assert.equal(released.length, 1);
  assert.deepEqual(released[0], {
    releasedByEmail: "ana@telita.cl",
    saleLineId: "line-1",
    saleLinePieceIds: ["piece-1"]
  });

  assert.equal(registered.length, 1);
  assert.deepEqual(registered[0], {
    cutJobId: "cut-1",
    saleLineId: "line-1",
    saleLinePieceId: "piece-1",
    branchId: "branch-1",
    skuId: "sku-1",
    scrapWidthM: 0.8,
    scrapHeightM: 2,
    generatedByEmail: "ana@telita.cl",
    locationPolicy: "AT_CUT_REQUIRE_LOCATION",
    locationCode: "B-02"
  });

  assert.deepEqual(result, {
    ok: true,
    scrap: {
      id: "scrap-1",
      status: "AVAILABLE",
      widthM: 0.8,
      heightM: 2,
      areaM2: 1.6,
      locationCode: "B-02",
      isUseful: true,
      pieceIndex: 1,
      pieceTotal: 1
    },
    locationPolicy: "AT_CUT_REQUIRE_LOCATION",
    scraps: [
      {
        id: "scrap-1",
        status: "AVAILABLE",
        widthM: 0.8,
        heightM: 2,
        areaM2: 1.6,
        locationCode: "B-02",
        isUseful: true,
        pieceIndex: 1,
        pieceTotal: 1
      }
    ]
  });
});

test("CutJobsWorkflowService builds synthetic pieces and falls back to default location", async () => {
  const released: Array<Record<string, unknown>> = [];
  const registered: Array<Record<string, unknown>> = [];

  const salesRepo = {
    async markCut() {
      return {
        id: "cut-2",
        saleLine: {
          id: "line-2",
          quantity: 2,
          requestedWidthM: 1.5,
          requestedHeightM: 1.2,
          sale: { branchId: "branch-1" },
          sku: {
            id: "sku-2",
            widthValue: 2,
            widthUnit: { toMeterFactor: 1 }
          },
          pieces: []
        }
      };
    }
  };

  const scrapsRepo = {
    async releaseSoftHoldsByCriteria(payload: Record<string, unknown>) {
      released.push(payload);
    },
    async registerFromCutJob(payload: Record<string, unknown>) {
      registered.push(payload);
      return {
        id: `scrap-${registered.length}`,
        status: "AVAILABLE",
        widthM: 0.5,
        heightM: 1.2,
        areaM2: 0.6,
        isUseful: true
      };
    }
  };

  const settingsRepo = {
    async getScrapPolicy() {
      return { locationPolicy: "AT_CUT_ROUTE_TO_INBOUND" };
    }
  };

  const auditRepo = {};

  const service = new CutJobsWorkflowService(
    salesRepo as never,
    scrapsRepo as never,
    settingsRepo as never,
    auditRepo as never
  );

  const result = await service.markCutAndRegisterScraps({
    cutJobId: "cut-2",
    actorEmail: "ana@telita.cl",
    defaultLocationCode: "IN-01"
  });

  assert.equal(released.length, 0);
  assert.equal(registered.length, 2);
  assert.deepEqual(
    registered.map((payload) => ({
      saleLinePieceId: payload.saleLinePieceId,
      locationCode: payload.locationCode,
      scrapWidthM: payload.scrapWidthM,
      scrapHeightM: payload.scrapHeightM
    })),
    [
      {
        saleLinePieceId: undefined,
        locationCode: "IN-01",
        scrapWidthM: 0.5,
        scrapHeightM: 1.2
      },
      {
        saleLinePieceId: undefined,
        locationCode: "IN-01",
        scrapWidthM: 0.5,
        scrapHeightM: 1.2
      }
    ]
  );

  assert.equal(result.locationPolicy, "AT_CUT_ROUTE_TO_INBOUND");
  assert.equal(result.scraps.length, 2);
  assert.equal(result.scrap?.locationCode, "IN-01");
});
