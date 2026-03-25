import { Injectable } from "@nestjs/common";
import { PrismaCustomersRepository, type CustomerPayload } from "../../infrastructure/persistence/prisma/prisma-customers.repository";

@Injectable()
export class CreateCustomerUseCase {
  constructor(private readonly customersRepo: PrismaCustomersRepository) {}

  execute(input: CustomerPayload, actorUserId: string) {
    return this.customersRepo.create(input, actorUserId);
  }
}
