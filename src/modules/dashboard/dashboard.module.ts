import { Module } from "@nestjs/common";
import { GetDashboardKpisUseCase } from "./application/use-cases/get-dashboard-kpis.use-case";
import { GetPendingScrapsUseCase } from "./application/use-cases/get-pending-scraps.use-case";
import { PrismaDashboardRepository } from "./infrastructure/persistence/prisma/prisma-dashboard.repository";
import { DashboardController } from "./presentation/controllers/dashboard.controller";

@Module({
  controllers: [DashboardController],
  providers: [PrismaDashboardRepository, GetDashboardKpisUseCase, GetPendingScrapsUseCase]
})
export class DashboardModule {}
