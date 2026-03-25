import { Injectable } from "@nestjs/common";
import { PrismaCustomersRepository, type CustomerPayload } from "../../infrastructure/persistence/prisma/prisma-customers.repository";

@Injectable()
export class UpdateCustomerUseCase {
  constructor(private readonly customersRepo: PrismaCustomersRepository) {}

  execute(id: string, input: Partial<Omit<CustomerPayload, "branchCode">>, actorUserId: string) {
    return this.customersRepo.update(id, input, actorUserId);
  }
}
