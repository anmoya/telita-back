import { Injectable } from "@nestjs/common";
import { PrismaCustomerDiscountsRepository } from "../../infrastructure/persistence/prisma/prisma-customer-discounts.repository";

@Injectable()
export class CreateCustomerDiscountUseCase {
  constructor(private readonly customerDiscountsRepo: PrismaCustomerDiscountsRepository) {}

  execute(input: {
    customerId: string;
    createdByEmail: string;
    discountCode?: string;
    discountPct: number;
    reason?: string;
    validFrom: string;
    validTo?: string;
  }) {
    return this.customerDiscountsRepo.create(input);
  }
}
