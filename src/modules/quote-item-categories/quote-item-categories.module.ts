import { Module } from "@nestjs/common";
import { CreateQuoteItemCategoryUseCase } from "./application/use-cases/create-quote-item-category.use-case";
import { ListQuoteItemCategoriesUseCase } from "./application/use-cases/list-quote-item-categories.use-case";
import { UpdateQuoteItemCategoryUseCase } from "./application/use-cases/update-quote-item-category.use-case";
import { PrismaQuoteItemCategoriesRepository } from "./infrastructure/persistence/prisma/prisma-quote-item-categories.repository";
import { QuoteItemCategoriesController } from "./presentation/controllers/quote-item-categories.controller";

@Module({
  controllers: [QuoteItemCategoriesController],
  providers: [
    PrismaQuoteItemCategoriesRepository,
    ListQuoteItemCategoriesUseCase,
    CreateQuoteItemCategoryUseCase,
    UpdateQuoteItemCategoryUseCase
  ]
})
export class QuoteItemCategoriesModule {}
