import assert from "node:assert/strict";
import test from "node:test";
import type { ArgumentsHost } from "@nestjs/common";
import { AppConflictError, AppNotFoundError, AppUnauthorizedError, AppValidationError } from "../application/errors/app-error";
import { AppErrorFilter } from "./app-error.filter";

function createHost(url = "/v1/example") {
  let statusCode = 0;
  let responseBody: Record<string, unknown> | null = null;

  const host = {
    switchToHttp() {
      return {
        getResponse() {
          return {
            status(code: number) {
              statusCode = code;
              return {
                json(body: Record<string, unknown>) {
                  responseBody = body;
                }
              };
            }
          };
        },
        getRequest() {
          return { url };
        }
      };
    }
  } as ArgumentsHost;

  return {
    host,
    getStatusCode: () => statusCode,
    getResponseBody: () => responseBody
  };
}

test("AppErrorFilter maps validation errors to 400 responses", () => {
  const filter = new AppErrorFilter();
  const http = createHost("/v1/scraps");

  filter.catch(new AppValidationError("Dato inválido."), http.host);

  assert.equal(http.getStatusCode(), 400);
  assert.deepEqual(http.getResponseBody(), {
    statusCode: 400,
    error: "Bad Request",
    message: "Dato inválido.",
    path: "/v1/scraps",
    timestamp: http.getResponseBody()?.timestamp
  });
  assert.equal(typeof http.getResponseBody()?.timestamp, "string");
});

test("AppErrorFilter maps not found, conflict and unauthorized errors", () => {
  const filter = new AppErrorFilter();

  const notFound = createHost("/v1/pricing");
  filter.catch(new AppNotFoundError("No existe."), notFound.host);
  assert.equal(notFound.getStatusCode(), 404);
  assert.equal(notFound.getResponseBody()?.error, "Not Found");

  const conflict = createHost("/v1/sales");
  filter.catch(new AppConflictError("Conflicto."), conflict.host);
  assert.equal(conflict.getStatusCode(), 409);
  assert.equal(conflict.getResponseBody()?.error, "Conflict");

  const unauthorized = createHost("/v1/auth");
  filter.catch(new AppUnauthorizedError("No autorizado."), unauthorized.host);
  assert.equal(unauthorized.getStatusCode(), 401);
  assert.equal(unauthorized.getResponseBody()?.error, "Unauthorized");
});
