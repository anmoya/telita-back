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

export abstract class StatusLabelsRepositoryPort {
  abstract getAllGrouped(): Promise<GroupedStatusLabels>;
  abstract getByEntityType(entityType: string): Promise<StatusLabelDTO[]>;
}
