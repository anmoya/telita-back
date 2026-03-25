import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { LoginUseCase } from "./login.use-case";

test("LoginUseCase returns token and serialized user for valid credentials", async () => {
  const authRepo = {
    async findActiveUserByEmail(email: string) {
      assert.equal(email, "ana@telita.cl");
      return {
        id: "user-1",
        email,
        fullName: "Ana",
        role: "admin",
        passwordHash: "hashed-password",
        onboardingCompletedAt: new Date("2026-03-23T00:00:00.000Z"),
        branch: { code: "MAIN", name: "Principal" }
      };
    }
  };

  const tokenService = {
    sign(payload: { sub: string; email: string; role: string }) {
      assert.deepEqual(payload, { sub: "user-1", email: "ana@telita.cl", role: "admin" });
      return "signed-token";
    }
  };

  const hasher = {
    async verify(password: string, hash: string) {
      assert.equal(password, "secret123");
      assert.equal(hash, "hashed-password");
      return true;
    }
  };

  const useCase = new LoginUseCase(
    authRepo as never,
    tokenService as never,
    hasher as never
  );

  const result = await useCase.execute("ana@telita.cl", "secret123");

  assert.equal(result.accessToken, "signed-token");
  assert.deepEqual(result.user, {
    id: "user-1",
    email: "ana@telita.cl",
    fullName: "Ana",
    role: "admin",
    branchCode: "MAIN",
    branchName: "Principal",
    onboardingCompletedAt: "2026-03-23T00:00:00.000Z"
  });
});

test("LoginUseCase rejects invalid password", async () => {
  const authRepo = {
    async findActiveUserByEmail() {
      return {
        id: "user-1",
        email: "ana@telita.cl",
        fullName: "Ana",
        role: "admin",
        passwordHash: "hashed-password",
        onboardingCompletedAt: null,
        branch: { code: "MAIN", name: "Principal" }
      };
    }
  };

  const tokenService = {
    sign() {
      throw new Error("tokenService.sign should not be called");
    }
  };

  const hasher = {
    async verify() {
      return false;
    }
  };

  const useCase = new LoginUseCase(
    authRepo as never,
    tokenService as never,
    hasher as never
  );

  await assert.rejects(
    () => useCase.execute("ana@telita.cl", "wrong-password"),
    (error: unknown) => error instanceof BadRequestException
  );
});
