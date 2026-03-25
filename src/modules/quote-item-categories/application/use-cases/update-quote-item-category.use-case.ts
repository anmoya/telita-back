import { Injectable } from "@nestjs/common";
import { PrismaQuoteItemCategoriesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-item-categories.repository";

@Injectable()
export class UpdateQuoteItemCategoryUseCase {
  constructor(private readonly quoteItemCategoriesRepo: PrismaQuoteItemCategoriesRepository) {}

  execute(input: { id: string; name?: string; isActive?: boolean; updatedByEmail: string }) {
    return this.quoteItemCategoriesRepo.update(input);
  }
}
