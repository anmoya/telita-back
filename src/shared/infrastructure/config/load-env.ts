import { existsSync, readFileSync } from "node:fs";

let envLoaded = false;
let cachedRuntimeEnv: RuntimeEnv | null = null;

export type RuntimeEnv = {
  DATABASE_URL: string;
  AUTH_SECRET: string;
  FRONTEND_ORIGIN: string;
  PORT: number;
};

export function ensureEnvLoaded() {
  if (envLoaded) {
    return;
  }

  if (existsSync(".env")) {
    const content = readFileSync(".env", "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      const normalizedValue = rawValue.replace(/^['"]|['"]$/g, "");

      if (process.env[key] === undefined) {
        process.env[key] = normalizedValue;
      }
    }
  }

  envLoaded = true;
}

export function getRuntimeEnv(): RuntimeEnv {
  if (cachedRuntimeEnv) {
    return cachedRuntimeEnv;
  }

  ensureEnvLoaded();

  const errors: string[] = [];
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const authSecret = process.env.AUTH_SECRET?.trim();
  const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim() || "http://localhost:3000";
  const rawPort = process.env.PORT?.trim() || "3001";
  const port = Number(rawPort);

  if (!databaseUrl) {
    errors.push("DATABASE_URL is required");
  }

  if (!authSecret) {
    errors.push("AUTH_SECRET is required");
  }

  if (!Number.isInteger(port) || port <= 0) {
    errors.push("PORT must be a positive integer");
  }

  try {
    const url = new URL(frontendOrigin);
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push("FRONTEND_ORIGIN must use http or https");
    }
  } catch {
    errors.push("FRONTEND_ORIGIN must be a valid absolute URL");
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n- ${errors.join("\n- ")}`
    );
  }

  cachedRuntimeEnv = {
    DATABASE_URL: databaseUrl!,
    AUTH_SECRET: authSecret!,
    FRONTEND_ORIGIN: frontendOrigin,
    PORT: port
  };

  return cachedRuntimeEnv;
}
