import { Injectable } from "@nestjs/common";
import { PrismaCustomerDiscountsRepository } from "../../infrastructure/persistence/prisma/prisma-customer-discounts.repository";

@Injectable()
export class UpdateCustomerDiscountUseCase {
  constructor(private readonly customerDiscountsRepo: PrismaCustomerDiscountsRepository) {}

  execute(id: string, input: {
    discountCode?: string;
    discountPct?: number;
    reason?: string;
    validFrom?: string;
    validTo?: string | null;
  }) {
    return this.customerDiscountsRepo.update(id, input);
  }
}
