import { Module } from "@nestjs/common";
import { PrismaQuoteItemCategoriesRepository } from "../quote-item-categories/infrastructure/persistence/prisma/prisma-quote-item-categories.repository";
import { CancelQuoteBatchUseCase } from "./application/use-cases/cancel-quote-batch.use-case";
import { CreateQuoteBatchUseCase } from "./application/use-cases/create-quote-batch.use-case";
import { DuplicateQuoteBatchUseCase } from "./application/use-cases/duplicate-quote-batch.use-case";
import { FinalizeQuoteBatchUseCase } from "./application/use-cases/finalize-quote-batch.use-case";
import { GetQuoteBatchByIdUseCase } from "./application/use-cases/get-quote-batch-by-id.use-case";
import { ListQuoteBatchesUseCase } from "./application/use-cases/list-quote-batches.use-case";
import { UpdateQuoteBatchUseCase } from "./application/use-cases/update-quote-batch.use-case";
import { PrismaQuoteBatchesRepository } from "./infrastructure/persistence/prisma/prisma-quote-batches.repository";
import { QuoteBatchesController } from "./presentation/controllers/quote-batches.controller";

@Module({
  controllers: [QuoteBatchesController],
  providers: [
    PrismaQuoteBatchesRepository,
    PrismaQuoteItemCategoriesRepository,
    CreateQuoteBatchUseCase,
    ListQuoteBatchesUseCase,
    GetQuoteBatchByIdUseCase,
    UpdateQuoteBatchUseCase,
    DuplicateQuoteBatchUseCase,
    FinalizeQuoteBatchUseCase,
    CancelQuoteBatchUseCase
  ]
})
export class QuoteBatchesModule {}
