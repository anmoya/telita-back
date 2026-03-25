import { Injectable } from "@nestjs/common";
import { PrismaDashboardRepository } from "../../infrastructure/persistence/prisma/prisma-dashboard.repository";

@Injectable()
export class GetPendingScrapsUseCase {
  constructor(private readonly dashboardRepo: PrismaDashboardRepository) {}

  execute(params: { branchCode: string; limit?: number }) {
    return this.dashboardRepo.getPendingScraps(params);
  }
}
