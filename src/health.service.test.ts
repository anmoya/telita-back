import assert from "node:assert/strict";
import test from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service";

test("HealthService returns live status with uptime and timestamp", () => {
  const service = new HealthService({} as never);

  const result = service.getLiveStatus();

  assert.equal(result.status, "ok");
  assert.equal(result.service, "telita-back");
  assert.equal(typeof result.uptimeSeconds, "number");
  assert.equal(typeof result.timestamp, "string");
});

test("HealthService returns readiness status when database check succeeds", async () => {
  const service = new HealthService({
    $queryRawUnsafe: async (query: string) => {
      assert.equal(query, "SELECT 1");
      return [{ "?column?": 1 }];
    }
  } as never);

  const result = await service.getReadinessStatus();

  assert.deepEqual(result.checks, { database: "ok" });
  assert.equal(result.status, "ok");
  assert.equal(result.service, "telita-back");
});

test("HealthService throws ServiceUnavailableException when database check fails", async () => {
  const service = new HealthService({
    $queryRawUnsafe: async () => {
      throw new Error("db down");
    }
  } as never);

  await assert.rejects(() => service.getReadinessStatus(), ServiceUnavailableException);
});
