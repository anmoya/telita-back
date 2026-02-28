import { Controller, Get, Headers, Query } from "@nestjs/common";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("audit")
export class AuditController {
  private readonly repo = new PrismaAuditRepository();

  @Get()
  async list(
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("branchCode") branchCode?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);

    const result = await this.repo.list({
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
