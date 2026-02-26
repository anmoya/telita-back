import { Module } from "@nestjs/common";
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

import { GetStatusLabelsUseCase } from "./modules/status-labels/application/use-cases/get-status-labels.use-case";
import { PrismaStatusLabelRepository } from "./modules/status-labels/infrastructure/persistence/prisma/prisma-status-label.repository";
import { PrismaBranchRepository } from "./modules/branches/infrastructure/persistence/prisma/prisma-branch.repository";

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
    BranchesController
  ],
  providers: [
    GetStatusLabelsUseCase,
    PrismaStatusLabelRepository,
    PrismaBranchRepository
  ]
})
export class AppModule {}
