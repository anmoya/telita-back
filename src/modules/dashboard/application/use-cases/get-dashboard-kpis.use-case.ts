import { Injectable } from "@nestjs/common";
import { PrismaDashboardRepository } from "../../infrastructure/persistence/prisma/prisma-dashboard.repository";

@Injectable()
export class GetDashboardKpisUseCase {
  constructor(private readonly dashboardRepo: PrismaDashboardRepository) {}

  execute(params: { branchCode: string; date?: string }) {
    return this.dashboardRepo.getKpis(params);
  }
}
