import assert from "node:assert/strict";
import test from "node:test";
import { AppNotFoundError } from "../../../../shared/application/errors/app-error";
import { GetCustomerByIdUseCase } from "./get-customer-by-id.use-case";

test("GetCustomerByIdUseCase returns the customer when it exists", async () => {
  const repository = {
    async findById(id: string) {
      return {
        id,
        fullName: "Cliente Uno",
        branch: { code: "MAIN", name: "Sucursal Principal" }
      };
    }
  };

  const useCase = new GetCustomerByIdUseCase(repository as never);
  const customer = await useCase.execute("customer-1");

  assert.equal(customer.id, "customer-1");
  assert.equal(customer.fullName, "Cliente Uno");
});

test("GetCustomerByIdUseCase throws AppNotFoundError when customer does not exist", async () => {
  const repository = {
    async findById() {
      return null;
    }
  };

  const useCase = new GetCustomerByIdUseCase(repository as never);

  await assert.rejects(
    () => useCase.execute("missing-customer"),
    (error: unknown) =>
      error instanceof AppNotFoundError
      && /cliente no encontrado/i.test(error.message)
  );
});
