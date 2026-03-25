import { Injectable } from "@nestjs/common";
import { PrismaCustomerDiscountsRepository } from "../../infrastructure/persistence/prisma/prisma-customer-discounts.repository";

@Injectable()
export class ListCustomerDiscountsUseCase {
  constructor(private readonly customerDiscountsRepo: PrismaCustomerDiscountsRepository) {}

  execute(customerId: string) {
    return this.customerDiscountsRepo.listByCustomer(customerId);
  }
}
