import { Module } from "@nestjs/common";
import { PrismaCustomerDiscountsRepository } from "../customers/infrastructure/persistence/prisma/prisma-customer-discounts.repository";
import { PrismaQuoteItemCategoriesRepository } from "../quote-item-categories/infrastructure/persistence/prisma/prisma-quote-item-categories.repository";
import { ScrapsModule } from "../scraps/scraps.module";
import { PrismaSettingsRepository } from "../settings/infrastructure/persistence/prisma/prisma-settings.repository";
import { CutJobsWorkflowService } from "./application/services/cut-jobs-workflow.service";
import { SalesOperationsService } from "./application/services/sales-operations.service";
import { SalesScrapWorkflowService } from "./application/services/sales-scrap-workflow.service";
import { PrismaSalesRepository } from "./infrastructure/persistence/prisma/prisma-sales.repository";
import { SalesCutJobsService } from "./infrastructure/services/sales-cut-jobs.service";
import { SalesDraftingService } from "./infrastructure/services/sales-drafting.service";
import { SalesLifecycleService } from "./infrastructure/services/sales-lifecycle.service";
import { SalesLineSupportService } from "./infrastructure/services/sales-line-support.service";
import { CutJobsController } from "./presentation/controllers/cut-jobs.controller";
import { SalesController } from "./presentation/controllers/sales.controller";

@Module({
  imports: [ScrapsModule],
  controllers: [SalesController, CutJobsController],
  providers: [
    PrismaSalesRepository,
    SalesOperationsService,
    CutJobsWorkflowService,
    SalesScrapWorkflowService,
    SalesCutJobsService,
    SalesDraftingService,
    SalesLifecycleService,
    SalesLineSupportService,
    PrismaQuoteItemCategoriesRepository,
    PrismaCustomerDiscountsRepository,
    PrismaSettingsRepository
  ]
})
export class SalesModule {}
