import { Injectable } from "@nestjs/common";
import { PrismaQuoteItemCategoriesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-item-categories.repository";

@Injectable()
export class CreateQuoteItemCategoryUseCase {
  constructor(private readonly quoteItemCategoriesRepo: PrismaQuoteItemCategoriesRepository) {}

  execute(input: { branchCode: string; name: string; createdByEmail: string }) {
    return this.quoteItemCategoriesRepo.create(input);
  }
}
