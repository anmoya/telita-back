import { Controller, Get, Query } from "@nestjs/common";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { ListAuditEntriesUseCase } from "../../application/use-cases/list-audit-entries.use-case";

@Authenticated("superadmin", "admin", "operador")
@Controller("audit")
export class AuditController {
  constructor(private readonly listAuditEntriesUseCase: ListAuditEntriesUseCase) {}

  @Get()
  async list(
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("branchCode") branchCode?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const result = await this.listAuditEntriesUseCase.execute({
      entityType,
      entityId,
      branchCode,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });

    return {
      data: result.data.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        action: row.action,
        actor: {
          email: row.actor.email,
          fullName: row.actor.fullName,
          role: row.actor.role
        },
        beforeJson: row.beforeJson,
        afterJson: row.afterJson,
        createdAt: row.createdAt.toISOString()
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    };
  }
}
