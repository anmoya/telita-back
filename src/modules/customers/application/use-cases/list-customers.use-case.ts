import { Injectable } from "@nestjs/common";
import { PrismaCustomersRepository } from "../../infrastructure/persistence/prisma/prisma-customers.repository";

@Injectable()
export class ListCustomersUseCase {
  constructor(private readonly customersRepo: PrismaCustomersRepository) {}

  execute(params: { branchCode: string; q?: string; isActive?: boolean }) {
    return this.customersRepo.list(params);
  }
}
