import { Injectable } from "@nestjs/common";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";

@Injectable()
export class ListAuditEntriesUseCase {
  constructor(private readonly auditRepo: PrismaAuditRepository) {}

  execute(params: {
    entityType?: string;
    entityId?: string;
    branchCode?: string;
    page?: number;
    limit?: number;
  }) {
    return this.auditRepo.list(params);
  }
}
