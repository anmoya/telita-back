import { AuditAction, Prisma } from "@prisma/client";
import { prismaClient } from "./prisma-client";

export class PrismaAuditRepository {
  async log(input: {
    branchId?: string | null;
    actorUserId: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    beforeJson?: unknown;
    afterJson?: unknown;
  }) {
    await prismaClient.auditLog.create({
      data: {
        branchId: input.branchId ?? null,
        actorUserId: input.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        beforeJson: toInputJson(input.beforeJson),
        afterJson: toInputJson(input.afterJson)
      }
    });
  }

  async list(params: {
    entityType?: string;
    entityId?: string;
    branchCode?: string;
    limit?: number;
  }) {
    return prismaClient.auditLog.findMany({
      where: {
        entityType: params.entityType,
        entityId: params.entityId,
        branch: params.branchCode ? { code: params.branchCode } : undefined
      },
      orderBy: { createdAt: "desc" },
      take: params.limit ?? 100,
      include: {
        actor: {
          select: {
            email: true,
            fullName: true,
            role: true
          }
        }
      }
    });
  }
}

function toInputJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
