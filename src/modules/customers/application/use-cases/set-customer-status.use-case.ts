import { Injectable } from "@nestjs/common";
import { PrismaCustomersRepository } from "../../infrastructure/persistence/prisma/prisma-customers.repository";

@Injectable()
export class SetCustomerStatusUseCase {
  constructor(private readonly customersRepo: PrismaCustomersRepository) {}

  execute(id: string, isActive: boolean, actorUserId: string) {
    return this.customersRepo.setStatus(id, isActive, actorUserId);
  }
}
