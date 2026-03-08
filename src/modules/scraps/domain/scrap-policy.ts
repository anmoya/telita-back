export type ScrapVariable =
  | "scrap_width_cm"
  | "scrap_height_cm"
  | "scrap_area_cm2"
  | "sku_width_cm"
  | "sku_length_cm"
  | "sku_thickness_cm";

export type ScrapExpression =
  | { const: number }
  | { var: ScrapVariable }
  | { op: "add" | "sub" | "mul" | "div"; left: ScrapExpression; right: ScrapExpression }
  | { op: "gt" | "gte" | "lt" | "lte" | "eq"; left: ScrapExpression; right: ScrapExpression }
  | { op: "and" | "or"; left: ScrapExpression; right: ScrapExpression }
  | { op: "not"; value: ScrapExpression };

export type ScrapClassificationRule = {
  version: 1;
  kind: "predicate";
  expression: ScrapExpression;
};

export type ScrapLocationPolicy = "AT_CUT_REQUIRE_LOCATION" | "AT_CUT_ROUTE_TO_INBOUND";

export type ScrapPolicy = {
  classificationRule: ScrapClassificationRule;
  locationPolicy: ScrapLocationPolicy;
};

export type ScrapRuleContext = Record<ScrapVariable, number>;

export const DEFAULT_SCRAP_POLICY: ScrapPolicy = {
  classificationRule: {
    version: 1,
    kind: "predicate",
    expression: {
      op: "gte",
      left: { var: "scrap_width_cm" },
      right: { const: 50 }
    }
  },
  locationPolicy: "AT_CUT_REQUIRE_LOCATION"
};

const ALLOWED_VARIABLES = new Set<ScrapVariable>([
  "scrap_width_cm",
  "scrap_height_cm",
  "scrap_area_cm2",
  "sku_width_cm",
  "sku_length_cm",
  "sku_thickness_cm"
]);

const NUMERIC_OPS = new Set(["add", "sub", "mul", "div"]);
const COMPARISON_OPS = new Set(["gt", "gte", "lt", "lte", "eq"]);
const BOOLEAN_OPS = new Set(["and", "or"]);

export function parseScrapPolicy(input: unknown): ScrapPolicy {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_SCRAP_POLICY };
  }
  const raw = input as Record<string, unknown>;
  const classificationRule = parseRule(raw.classificationRule);
  const locationPolicy = parseLocationPolicy(raw.locationPolicy);
  return { classificationRule, locationPolicy };
}

export function evaluateScrapRule(rule: ScrapClassificationRule, context: ScrapRuleContext): boolean {
  const result = evaluateNode(rule.expression, context);
  if (typeof result !== "boolean") {
    throw new Error("La regla de retazo debe resolver a boolean.");
  }
  return result;
}

export function extractMinWidthThresholdCm(policy: ScrapPolicy): number | null {
  const expression = policy.classificationRule.expression;
  if (!("op" in expression) || expression.op !== "gte") return null;
  if (!("var" in expression.left) || expression.left.var !== "scrap_width_cm") return null;
  if (!("const" in expression.right) || typeof expression.right.const !== "number") return null;
  return expression.right.const;
}

export function buildMinWidthPolicy(widthCm: number, locationPolicy: ScrapLocationPolicy): ScrapPolicy {
  return {
    classificationRule: {
      version: 1,
      kind: "predicate",
      expression: {
        op: "gte",
        left: { var: "scrap_width_cm" },
        right: { const: widthCm }
      }
    },
    locationPolicy
  };
}

function parseRule(input: unknown): ScrapClassificationRule {
  if (!input || typeof input !== "object") {
    return DEFAULT_SCRAP_POLICY.classificationRule;
  }
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1 || raw.kind !== "predicate") {
    throw new Error("La regla de retazo debe usar version 1 y kind predicate.");
  }
  const expression = parseExpression(raw.expression);
  const dryRun = evaluateNode(expression, {
    scrap_width_cm: 0,
    scrap_height_cm: 0,
    scrap_area_cm2: 0,
    sku_width_cm: 0,
    sku_length_cm: 0,
    sku_thickness_cm: 0
  });
  if (typeof dryRun !== "boolean") {
    throw new Error("La expresion de retazo debe evaluar a boolean.");
  }
  return {
    version: 1,
    kind: "predicate",
    expression
  };
}

function parseLocationPolicy(input: unknown): ScrapLocationPolicy {
  if (input === "AT_CUT_REQUIRE_LOCATION" || input === "AT_CUT_ROUTE_TO_INBOUND") {
    return input;
  }
  if (input == null) return DEFAULT_SCRAP_POLICY.locationPolicy;
  throw new Error("locationPolicy invalida.");
}

function parseExpression(input: unknown): ScrapExpression {
  if (!input || typeof input !== "object") {
    throw new Error("Expresion de retazo invalida.");
  }
  const raw = input as Record<string, unknown>;

  if ("const" in raw) {
    if (typeof raw.const !== "number" || !Number.isFinite(raw.const)) {
      throw new Error("const debe ser numerico.");
    }
    return { const: raw.const };
  }

  if ("var" in raw) {
    if (typeof raw.var !== "string" || !ALLOWED_VARIABLES.has(raw.var as ScrapVariable)) {
      throw new Error("Variable de retazo invalida.");
    }
    return { var: raw.var as ScrapVariable };
  }

  if (raw.op === "not") {
    return { op: "not", value: parseExpression(raw.value) };
  }

  if (typeof raw.op !== "string") {
    throw new Error("Operacion de retazo invalida.");
  }

  if (NUMERIC_OPS.has(raw.op) || COMPARISON_OPS.has(raw.op) || BOOLEAN_OPS.has(raw.op)) {
    return {
      op: raw.op as
        | "add"
        | "sub"
        | "mul"
        | "div"
        | "gt"
        | "gte"
        | "lt"
        | "lte"
        | "eq"
        | "and"
        | "or",
      left: parseExpression(raw.left),
      right: parseExpression(raw.right)
    };
  }

  throw new Error("Operacion de retazo no soportada.");
}

function evaluateNode(node: ScrapExpression, context: ScrapRuleContext): boolean | number {
  if ("const" in node) return node.const;
  if ("var" in node) return context[node.var];

  if (node.op === "not") {
    const value = evaluateNode(node.value, context);
    if (typeof value !== "boolean") throw new Error("not requiere boolean.");
    return !value;
  }

  const left = evaluateNode(node.left, context);
  const right = evaluateNode(node.right, context);

  if (NUMERIC_OPS.has(node.op)) {
    if (typeof left !== "number" || typeof right !== "number") {
      throw new Error(`${node.op} requiere operandos numericos.`);
    }
    if (node.op === "add") return left + right;
    if (node.op === "sub") return left - right;
    if (node.op === "mul") return left * right;
    return right === 0 ? 0 : left / right;
  }

  if (COMPARISON_OPS.has(node.op)) {
    if (typeof left !== "number" || typeof right !== "number") {
      throw new Error(`${node.op} requiere operandos numericos.`);
    }
    if (node.op === "gt") return left > right;
    if (node.op === "gte") return left >= right;
    if (node.op === "lt") return left < right;
    if (node.op === "lte") return left <= right;
    return left === right;
  }

  if (typeof left !== "boolean" || typeof right !== "boolean") {
    throw new Error(`${node.op} requiere operandos booleanos.`);
  }
  return node.op === "and" ? left && right : left || right;
}
