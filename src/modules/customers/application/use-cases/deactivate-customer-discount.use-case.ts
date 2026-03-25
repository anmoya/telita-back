import { Injectable } from "@nestjs/common";
import { PrismaCustomerDiscountsRepository } from "../../infrastructure/persistence/prisma/prisma-customer-discounts.repository";

@Injectable()
export class DeactivateCustomerDiscountUseCase {
  constructor(private readonly customerDiscountsRepo: PrismaCustomerDiscountsRepository) {}

  execute(id: string) {
    return this.customerDiscountsRepo.deactivate(id);
  }
}
