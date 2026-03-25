import { Injectable } from "@nestjs/common";
import { PrismaQuoteItemCategoriesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-item-categories.repository";

@Injectable()
export class ListQuoteItemCategoriesUseCase {
  constructor(private readonly quoteItemCategoriesRepo: PrismaQuoteItemCategoriesRepository) {}

  execute(params: { branchCode: string; isActive?: boolean }) {
    return this.quoteItemCategoriesRepo.list(params);
  }
}
