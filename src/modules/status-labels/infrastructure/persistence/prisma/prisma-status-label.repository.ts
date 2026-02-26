import { Injectable } from "@nestjs/common";
import { PrismaClient, StatusLabel } from "@prisma/client";

const prisma = new PrismaClient();

export interface StatusLabelDTO {
  code: string;
  label: string;
  description: string;
}

export interface GroupedStatusLabels {
  sale: StatusLabelDTO[];
  cut_job: StatusLabelDTO[];
  scrap: StatusLabelDTO[];
}

@Injectable()
export class PrismaStatusLabelRepository {
  async getAllGrouped(): Promise<GroupedStatusLabels> {
    const labels = await prisma.statusLabel.findMany({
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
    const labels = await prisma.statusLabel.findMany({
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
