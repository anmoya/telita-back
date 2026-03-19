/* eslint-disable no-restricted-imports */
import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { HealthController } from "./health.controller";
import { AuthController } from "./modules/auth/presentation/controllers/auth.controller";
import { PricingController } from "./modules/pricing/presentation/controllers/pricing.controller";
import { PriceListsController } from "./modules/pricing/presentation/controllers/price-lists.controller";
import { CatalogController } from "./modules/catalog/presentation/controllers/catalog.controller";
import { SalesController } from "./modules/sales/presentation/controllers/sales.controller";
import { CutJobsController } from "./modules/sales/presentation/controllers/cut-jobs.controller";
import { ScrapsController } from "./modules/scraps/presentation/controllers/scraps.controller";
import { StorageLocationsController } from "./modules/scraps/presentation/controllers/storage-locations.controller";
import { LabelsController } from "./modules/labels/presentation/controllers/labels.controller";
import { AuditController } from "./modules/audit/presentation/controllers/audit.controller";
import { DashboardController } from "./modules/dashboard/presentation/controllers/dashboard.controller";
import { SettingsController } from "./modules/settings/presentation/controllers/settings.controller";
import { UsersController } from "./modules/users/presentation/controllers/users.controller";
import { StatusLabelsController } from "./modules/status-labels/presentation/controllers/status-labels.controller";
import { BranchesController } from "./modules/branches/presentation/controllers/branches.controller";
import { QuoteItemCategoriesController } from "./modules/quote-item-categories/presentation/controllers/quote-item-categories.controller";
import { QuoteBatchesController } from "./modules/quote-batches/presentation/controllers/quote-batches.controller";
import { CustomersController } from "./modules/customers/presentation/controllers/customers.controller";

import { GetStatusLabelsUseCase } from "./modules/status-labels/application/use-cases/get-status-labels.use-case";
import { StatusLabelsRepositoryPort } from "./modules/status-labels/application/ports/status-labels.repository.port";
import { PrismaStatusLabelRepository } from "./modules/status-labels/infrastructure/persistence/prisma/prisma-status-label.repository";
import { PrismaBranchRepository } from "./modules/branches/infrastructure/persistence/prisma/prisma-branch.repository";
import { PrismaAuthRepository } from "./modules/auth/infrastructure/prisma-auth.repository";
import { TokenService } from "./shared/infrastructure/auth/token.service";
import { BcryptPasswordHasher } from "./shared/infrastructure/auth/bcrypt-password-hasher";
import { PrismaSalesRepository } from "./modules/sales/infrastructure/persistence/prisma/prisma-sales.repository";
import { PrismaScrapsRepository } from "./modules/scraps/infrastructure/persistence/prisma/prisma-scraps.repository";
import { PrismaSettingsRepository } from "./modules/settings/infrastructure/persistence/prisma/prisma-settings.repository";
import { PrismaAuditRepository } from "./shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaLabelsRepository } from "./modules/labels/infrastructure/persistence/prisma/prisma-labels.repository";
import { PrismaUsersRepository } from "./modules/users/infrastructure/persistence/prisma/prisma-users.repository";
import { PrismaPriceRepository } from "./modules/pricing/infrastructure/persistence/prisma/prisma-price.repository";
import { PrismaPriceListRepository } from "./modules/pricing/infrastructure/persistence/prisma/prisma-price-list.repository";
import { PrismaPriceListItemRepository } from "./modules/pricing/infrastructure/persistence/prisma/prisma-price-list-item.repository";
import { prismaClient } from "./shared/infrastructure/persistence/prisma-client";
import { SystemClockService } from "./shared/infrastructure/time/system-clock.service";

@Module({
  controllers: [
    HealthController,
    AuthController,
    PricingController,
    PriceListsController,
    CatalogController,
    SalesController,
    CutJobsController,
    ScrapsController,
    StorageLocationsController,
    LabelsController,
    AuditController,
    DashboardController,
    SettingsController,
    UsersController,
    StatusLabelsController,
    BranchesController,
    QuoteItemCategoriesController,
    QuoteBatchesController,
    CustomersController
  ],
  providers: [
    GetStatusLabelsUseCase,
    PrismaBranchRepository,
    PrismaAuthRepository,
    BcryptPasswordHasher,
    PrismaSalesRepository,
    PrismaScrapsRepository,
    PrismaSettingsRepository,
    PrismaAuditRepository,
    PrismaLabelsRepository,
    PrismaUsersRepository,
    PrismaPriceRepository,
    PrismaPriceListRepository,
    PrismaPriceListItemRepository,
    SystemClockService,
    {
      provide: StatusLabelsRepositoryPort,
      useClass: PrismaStatusLabelRepository
    },
    {
      provide: PrismaClient,
      useValue: prismaClient
    },
    {
      provide: TokenService,
      useFactory: () => new TokenService(process.env.AUTH_SECRET ?? "telita_dev_secret")
    }
  ]
})
export class AppModule {}
