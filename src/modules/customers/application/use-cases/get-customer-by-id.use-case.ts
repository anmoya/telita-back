import { Injectable } from "@nestjs/common";
import { AppNotFoundError } from "../../../../shared/application/errors/app-error";
import { PrismaCustomersRepository } from "../../infrastructure/persistence/prisma/prisma-customers.repository";

@Injectable()
export class GetCustomerByIdUseCase {
  constructor(private readonly customersRepo: PrismaCustomersRepository) {}

  async execute(id: string) {
    const customer = await this.customersRepo.findById(id);
    if (!customer) {
      throw new AppNotFoundError("Cliente no encontrado.");
    }
    return customer;
  }
}
