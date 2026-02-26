import { Injectable } from "@nestjs/common";
import { PrismaStatusLabelRepository, GroupedStatusLabels } from "../../infrastructure/persistence/prisma/prisma-status-label.repository";

@Injectable()
export class GetStatusLabelsUseCase {
  constructor(private readonly repository: PrismaStatusLabelRepository) {}

  async execute(): Promise<GroupedStatusLabels> {
    return this.repository.getAllGrouped();
  }
}
