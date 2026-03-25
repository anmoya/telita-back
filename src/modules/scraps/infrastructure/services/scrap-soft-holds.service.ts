import { Injectable } from "@nestjs/common";
import { AuditAction, PrismaClient, ScrapStatus, SoftHoldStatus } from "@prisma/client";
import { AppConflictError, AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaSettingsRepository } from "../../../settings/infrastructure/persistence/prisma/prisma-settings.repository";

@Injectable()
export class ScrapSoftHoldsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository,
    private readonly settingsRepo: PrismaSettingsRepository
  ) {}

  async expireStaleHolds() {
    const now = new Date();
    const stale = await this.prisma.scrapSoftHold.findMany({
      where: { status: SoftHoldStatus.ACTIVE, expiresAt: { lte: now } }
    });
    if (stale.length === 0) return;

    await this.prisma.scrapSoftHold.updateMany({
      where: { status: SoftHoldStatus.ACTIVE, expiresAt: { lte: now } },
      data: { status: SoftHoldStatus.EXPIRED }
    });

    for (const hold of stale) {
      await this.auditRepo.log({
        branchId: hold.branchId,
        actorUserId: hold.heldBy,
        entityType: "scrap_soft_hold",
        entityId: hold.id,
        action: AuditAction.STATUS_CHANGE,
        beforeJson: { status: "ACTIVE" },
        afterJson: { status: "EXPIRED", expiredAt: now.toISOString() }
      });
    }
  }

  async createSoftHold(input: {
    scrapId: string;
    saleId: string;
    saleLineId?: string;
    saleLinePieceId?: string;
    heldByEmail: string;
    minutes: number;
    reason?: string;
  }) {
    await this.expireStaleHolds();

    const user = await this.prisma.appUser.findUnique({ where: { email: input.heldByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const scrap = await this.prisma.scrap.findUnique({ where: { id: input.scrapId } });
    if (!scrap) throw new AppNotFoundError("Retazo no encontrado.");
    if (scrap.status !== ScrapStatus.STORED) throw new AppValidationError("Solo retazos en estado ALMACENADO pueden reservarse.");

    const activeAlloc = await this.prisma.saleLineScrapAllocation.findFirst({
      where: { scrapId: input.scrapId, isActive: true }
    });
    if (activeAlloc) throw new AppConflictError("El retazo ya tiene una asignacion activa.");

    const existingHold = await this.prisma.scrapSoftHold.findFirst({
      where: { scrapId: input.scrapId, status: SoftHoldStatus.ACTIVE }
    });
    if (existingHold) throw new AppConflictError("El retazo ya tiene una reserva activa.");

    const policy = await this.settingsRepo.getSoftHoldPolicy();
    if (!policy.enabled) throw new AppValidationError("La reserva temporal no esta habilitada.");
    const clampedMinutes = Math.max(1, Math.min(input.minutes, policy.maxMinutes));
    const expiresAt = new Date(Date.now() + clampedMinutes * 60_000);

    const hold = await this.prisma.scrapSoftHold.create({
      data: {
        branchId: scrap.branchId,
        scrapId: input.scrapId,
        saleId: input.saleId,
        saleLineId: input.saleLineId ?? null,
        saleLinePieceId: input.saleLinePieceId ?? null,
        heldBy: user.id,
        reason: input.reason?.trim() || null,
        expiresAt
      }
    });

    await this.auditRepo.log({
      branchId: scrap.branchId,
      actorUserId: user.id,
      entityType: "scrap_soft_hold",
      entityId: hold.id,
      action: AuditAction.CREATE,
      afterJson: {
        scrapId: input.scrapId,
        saleId: input.saleId,
        saleLineId: input.saleLineId ?? null,
        saleLinePieceId: input.saleLinePieceId ?? null,
        minutes: clampedMinutes,
        expiresAt: expiresAt.toISOString()
      }
    });

    return { id: hold.id, scrapId: hold.scrapId, status: hold.status, expiresAt: hold.expiresAt };
  }

  async releaseSoftHold(input: { scrapId: string; releasedByEmail: string }) {
    const user = await this.prisma.appUser.findUnique({ where: { email: input.releasedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const hold = await this.prisma.scrapSoftHold.findFirst({
      where: { scrapId: input.scrapId, status: SoftHoldStatus.ACTIVE }
    });
    if (!hold) throw new AppNotFoundError("No existe una reserva activa para este retazo.");

    const releasedAt = new Date();
    await this.prisma.scrapSoftHold.update({
      where: { id: hold.id },
      data: { status: SoftHoldStatus.RELEASED, releasedAt }
    });

    await this.auditRepo.log({
      branchId: hold.branchId,
      actorUserId: user.id,
      entityType: "scrap_soft_hold",
      entityId: hold.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: "ACTIVE" },
      afterJson: { status: "RELEASED", releasedAt: releasedAt.toISOString() }
    });
  }

  async getActiveSoftHold(scrapId: string) {
    await this.expireStaleHolds();
    return this.prisma.scrapSoftHold.findFirst({
      where: { scrapId, status: SoftHoldStatus.ACTIVE },
      include: { heldByUser: { select: { email: true, fullName: true } } }
    });
  }

  async releaseSoftHoldsByCriteria(input: {
    releasedByEmail: string;
    saleId?: string;
    saleLineId?: string;
    saleLinePieceIds?: string[];
    holdIds?: string[];
  }) {
    const user = await this.prisma.appUser.findUnique({ where: { email: input.releasedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const holds = await this.prisma.scrapSoftHold.findMany({
      where: {
        status: SoftHoldStatus.ACTIVE,
        ...(input.saleId ? { saleId: input.saleId } : {}),
        ...(input.saleLineId ? { saleLineId: input.saleLineId } : {}),
        ...(input.saleLinePieceIds?.length ? { saleLinePieceId: { in: input.saleLinePieceIds } } : {}),
        ...(input.holdIds?.length ? { id: { in: input.holdIds } } : {})
      }
    });

    for (const hold of holds) {
      const releasedAt = new Date();
      await this.prisma.scrapSoftHold.update({
        where: { id: hold.id },
        data: { status: SoftHoldStatus.RELEASED, releasedAt }
      });
      await this.auditRepo.log({
        branchId: hold.branchId,
        actorUserId: user.id,
        entityType: "scrap_soft_hold",
        entityId: hold.id,
        action: AuditAction.STATUS_CHANGE,
        beforeJson: { status: "ACTIVE" },
        afterJson: {
          status: "RELEASED",
          releasedAt: releasedAt.toISOString(),
          saleId: hold.saleId,
          saleLineId: hold.saleLineId,
          saleLinePieceId: hold.saleLinePieceId ?? null
        }
      });
    }
  }
}
