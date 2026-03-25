import { Injectable } from "@nestjs/common";
import { AuditAction, Prisma, PrismaClient } from "@prisma/client";

export type AuditActionCode = "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE" | "PRINT";

@Injectable()
export class PrismaAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async logByActorEmail(input: {
    actorEmail: string;
    branchId?: string | null;
    entityType: string;
    entityId: string;
    action: AuditActionCode;
    beforeJson?: unknown;
    afterJson?: unknown;
  }) {
    const actor = await this.prisma.appUser.findUnique({
      where: { email: input.actorEmail },
      select: { id: true }
    });
    if (!actor) {
      return false;
    }

    await this.log({
      branchId: input.branchId,
      actorUserId: actor.id,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson
    });

    return true;
  }

  async log(input: {
    branchId?: string | null;
    actorUserId: string;
    entityType: string;
    entityId: string;
    action: AuditActionCode;
    beforeJson?: unknown;
    afterJson?: unknown;
  }) {
    await this.prisma.auditLog.create({
      data: {
        branchId: input.branchId ?? null,
        actorUserId: input.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action as AuditAction,
        beforeJson: toInputJson(input.beforeJson),
        afterJson: toInputJson(input.afterJson)
      }
    });
  }

  async list(params: {
    entityType?: string;
    entityId?: string;
    branchCode?: string;
    page?: number;
    limit?: number;
  }) {
    const limit = Math.min(params.limit ?? 20, 100);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const where = {
      entityType: params.entityType,
      entityId: params.entityId,
      branch: params.branchCode ? { code: params.branchCode } : undefined
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { actor: { select: { email: true, fullName: true, role: true } } }
      }),
      this.prisma.auditLog.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

function toInputJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
