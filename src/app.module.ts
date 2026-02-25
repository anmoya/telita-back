import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthController } from "./modules/auth/presentation/controllers/auth.controller";
import { PricingController } from "./modules/pricing/presentation/controllers/pricing.controller";
import { CatalogController } from "./modules/catalog/presentation/controllers/catalog.controller";
import { SalesController } from "./modules/sales/presentation/controllers/sales.controller";
import { CutJobsController } from "./modules/sales/presentation/controllers/cut-jobs.controller";
import { ScrapsController } from "./modules/scraps/presentation/controllers/scraps.controller";
import { StorageLocationsController } from "./modules/scraps/presentation/controllers/storage-locations.controller";
import { LabelsController } from "./modules/labels/presentation/controllers/labels.controller";
import { AuditController } from "./modules/audit/presentation/controllers/audit.controller";
import { DashboardController } from "./modules/dashboard/presentation/controllers/dashboard.controller";
import { SettingsController } from "./modules/settings/presentation/controllers/settings.controller";

@Module({
  controllers: [
    HealthController,
    AuthController,
    PricingController,
    CatalogController,
    SalesController,
    CutJobsController,
    ScrapsController,
    StorageLocationsController,
    LabelsController,
    AuditController,
    DashboardController,
    SettingsController
  ]
})
export class AppModule {}
