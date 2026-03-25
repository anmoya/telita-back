/* eslint-disable no-restricted-imports */
import { Module } from "@nestjs/common";
import { HealthModule } from "./health.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BranchesModule } from "./modules/branches/branches.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { LabelsModule } from "./modules/labels/labels.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { QuoteBatchesModule } from "./modules/quote-batches/quote-batches.module";
import { QuoteItemCategoriesModule } from "./modules/quote-item-categories/quote-item-categories.module";
import { SalesModule } from "./modules/sales/sales.module";
import { ScrapsModule } from "./modules/scraps/scraps.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { StatusLabelsModule } from "./modules/status-labels/status-labels.module";
import { UsersModule } from "./modules/users/users.module";
import { SharedModule } from "./shared/shared.module";

@Module({
  imports: [
    SharedModule,
    HealthModule,
    AuditModule,
    AuthModule,
    BranchesModule,
    CatalogModule,
    CustomersModule,
    DashboardModule,
    LabelsModule,
    PricingModule,
    QuoteBatchesModule,
    QuoteItemCategoriesModule,
    SalesModule,
    ScrapsModule,
    SettingsModule,
    StatusLabelsModule,
    UsersModule
  ],
  controllers: []
})
export class AppModule {}
