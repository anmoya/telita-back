import assert from "node:assert/strict";
import test from "node:test";
import { AppValidationError } from "../../../shared/application/errors/app-error";
import { buildMinWidthPolicy, evaluateScrapRule, parseScrapPolicy } from "./scrap-policy";

test("parseScrapPolicy throws AppValidationError for invalid location policy", () => {
  assert.throws(
    () => parseScrapPolicy({ locationPolicy: "BAD_POLICY", classificationRule: { version: 1, kind: "predicate", expression: { op: "gte", left: { var: "scrap_width_cm" }, right: { const: 50 } } } }),
    AppValidationError
  );
});

test("evaluateScrapRule throws AppValidationError when expression does not resolve to boolean", () => {
  assert.throws(
    () => evaluateScrapRule({
      version: 1,
      kind: "predicate",
      expression: { const: 10 } as never
    }, {
      scrap_width_cm: 0,
      scrap_height_cm: 0,
      scrap_area_cm2: 0,
      sku_width_cm: 0,
      sku_length_cm: 0,
      sku_thickness_cm: 0
    }),
    AppValidationError
  );
});

test("buildMinWidthPolicy creates a valid boolean scrap rule", () => {
  const policy = buildMinWidthPolicy(60, "AT_CUT_REQUIRE_LOCATION");
  const result = evaluateScrapRule(policy.classificationRule, {
    scrap_width_cm: 75,
    scrap_height_cm: 90,
    scrap_area_cm2: 6750,
    sku_width_cm: 280,
    sku_length_cm: 500,
    sku_thickness_cm: 0
  });

  assert.equal(result, true);
});
