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
    @Query("limit") limit?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);

    const rows = await this.repo.list({
      entityType,
      entityId,
      branchCode,
      limit: limit ? Number(limit) : undefined
    });

    return rows.map((row) => ({
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
    }));
  }
}
