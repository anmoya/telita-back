import { Injectable } from "@nestjs/common";
import { GroupedStatusLabels, StatusLabelsRepositoryPort } from "../ports/status-labels.repository.port";

@Injectable()
export class GetStatusLabelsUseCase {
  constructor(private readonly repository: StatusLabelsRepositoryPort) {}

  async execute(): Promise<GroupedStatusLabels> {
    return this.repository.getAllGrouped();
  }
}
