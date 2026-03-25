import { Injectable } from "@nestjs/common";
import { PrismaClient, StatusLabel } from "@prisma/client";
import {
  GroupedStatusLabels,
  StatusLabelDTO,
  StatusLabelsRepositoryPort
} from "../../../application/ports/status-labels.repository.port";
@Injectable()
export class PrismaStatusLabelRepository implements StatusLabelsRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getAllGrouped(): Promise<GroupedStatusLabels> {
    const labels = await this.prisma.statusLabel.findMany({
      orderBy: [{ entityType: "asc" }, { statusCode: "asc" }]
    });

    const grouped: GroupedStatusLabels = {
      sale: [],
      cut_job: [],
      scrap: []
    };

    for (const label of labels) {
      const dto: StatusLabelDTO = {
        code: label.statusCode,
        label: label.labelEs,
        description: label.descriptionEs
      };

      if (label.entityType === "sale") {
        grouped.sale.push(dto);
      } else if (label.entityType === "cut_job") {
        grouped.cut_job.push(dto);
      } else if (label.entityType === "scrap") {
        grouped.scrap.push(dto);
      }
    }

    return grouped;
  }

  async getByEntityType(entityType: string): Promise<StatusLabelDTO[]> {
    const labels = await this.prisma.statusLabel.findMany({
      where: { entityType },
      orderBy: { statusCode: "asc" }
    });

    return labels.map((label) => ({
      code: label.statusCode,
      label: label.labelEs,
      description: label.descriptionEs
    }));
  }
}
