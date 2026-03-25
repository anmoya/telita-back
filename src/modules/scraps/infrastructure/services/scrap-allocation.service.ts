import { Injectable } from "@nestjs/common";
import { AuditAction, PrismaClient, ScrapStatus, SoftHoldStatus } from "@prisma/client";
import { AppConflictError, AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";

@Injectable()
export class ScrapAllocationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async getPickListView(input: {
    saleId: string;
    items: Array<{ saleLineId: string; scrapId: string }>;
  }) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: input.saleId },
      include: { branch: true, customer: true }
    });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");

    const saleLineIds = Array.from(new Set(input.items.map((item) => item.saleLineId)));
    const scrapIds = Array.from(new Set(input.items.map((item) => item.scrapId)));

    const [lines, scraps, labels] = await Promise.all([
      this.prisma.saleLine.findMany({
        where: { id: { in: saleLineIds } },
        include: { sku: true }
      }),
      this.prisma.scrap.findMany({
        where: { id: { in: scrapIds } },
        include: { location: true }
      }),
      this.prisma.label.findMany({
        where: { scrapId: { in: scrapIds } },
        select: { id: true, scrapId: true },
        orderBy: { createdAt: "desc" }
      })
    ]);

    const lineById = new Map(lines.map((line) => [line.id, line]));
    const scrapById = new Map(scraps.map((scrap) => [scrap.id, scrap]));
    const labelByScrapId = new Map<string, { id: string; scrapId: string | null }>();

    for (const label of labels) {
      if (label.scrapId && !labelByScrapId.has(label.scrapId)) {
        labelByScrapId.set(label.scrapId, label);
      }
    }

    const pickItems = input.items.flatMap((item, index) => {
      const line = lineById.get(item.saleLineId);
      const scrap = scrapById.get(item.scrapId);
      if (!line || !scrap) return [];

      const labelRecord = labelByScrapId.get(scrap.id);
      return [{
        lineIndex: index + 1,
        skuCode: line.sku.code,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        scrapWidthM: Number(scrap.widthM),
        scrapHeightM: Number(scrap.heightM),
        locationCode: scrap.location?.code ?? "Sin ubicación",
        labelCode: labelRecord?.id.slice(0, 8) ?? scrap.id.slice(0, 8)
      }];
    });

    return { sale, pickItems };
  }

  async allocateToSaleLine(input: { saleLineId: string; scrapId: string; allocatedByEmail: string }) {
    const line = await this.prisma.saleLine.findUnique({
      where: { id: input.saleLineId },
      include: {
        pieces: {
          include: {
            allocations: { where: { isActive: true }, select: { id: true } }
          },
          orderBy: { pieceIndex: "asc" }
        }
      }
    });
    if (!line) throw new AppNotFoundError("Línea de venta no encontrada.");

    const freePiece = line.pieces.find((piece) => piece.allocations.length === 0);
    if (!freePiece) throw new AppConflictError("La línea no tiene piezas libres para asignar retazos.");

    return this.allocateToSaleLinePiece({
      saleLineId: input.saleLineId,
      saleLinePieceId: freePiece.id,
      scrapId: input.scrapId,
      allocatedByEmail: input.allocatedByEmail
    });
  }

  async allocateToSaleLinePiece(input: {
    saleLineId: string;
    saleLinePieceId: string;
    scrapId: string;
    allocatedByEmail: string;
  }) {
    const user = await this.prisma.appUser.findUnique({ where: { email: input.allocatedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const scrap = await this.prisma.scrap.findUnique({ where: { id: input.scrapId } });
    if (!scrap) throw new AppNotFoundError("Retazo no encontrado.");
    if (scrap.status !== ScrapStatus.STORED) {
      throw new AppValidationError("El retazo debe estar en estado ALMACENADO para ser asignado.");
    }

    const existing = await this.prisma.saleLineScrapAllocation.findFirst({
      where: { scrapId: input.scrapId, isActive: true }
    });
    if (existing) throw new AppConflictError("El retazo ya tiene una asignación activa.");

    const activeHold = await this.prisma.scrapSoftHold.findFirst({
      where: { scrapId: input.scrapId, status: SoftHoldStatus.ACTIVE, expiresAt: { gt: new Date() } }
    });
    if (activeHold && activeHold.heldBy !== user.id) {
      throw new AppConflictError("El retazo esta reservado temporalmente por otro usuario.");
    }

    const saleLine = await this.prisma.saleLine.findUnique({
      where: { id: input.saleLineId },
      include: {
        sale: true,
        pieces: {
          where: { id: input.saleLinePieceId },
          include: { allocations: { where: { isActive: true }, select: { id: true } } }
        }
      }
    });
    if (!saleLine) throw new AppNotFoundError("Línea de venta no encontrada.");
    if (!canManuallyAllocateScrap(saleLine.sale.status)) {
      throw new AppValidationError("Solo se puede asignar a líneas de venta en estado DRAFT o CONFIRMED.");
    }

    const piece = saleLine.pieces[0];
    if (!piece) throw new AppNotFoundError("Pieza de venta no encontrada.");
    if (piece.allocations.length > 0) {
      throw new AppConflictError("La pieza de venta ya tiene una asignación activa.");
    }

    const allocation = await this.prisma.saleLineScrapAllocation.create({
      data: {
        saleLineId: input.saleLineId,
        saleLinePieceId: input.saleLinePieceId,
        scrapId: input.scrapId,
        allocatedBy: user.id,
        allocatedAt: new Date()
      }
    });

    if (activeHold) {
      await this.prisma.scrapSoftHold.update({
        where: { id: activeHold.id },
        data: { status: SoftHoldStatus.CONVERTED, convertedAt: new Date() }
      });
      await this.auditRepo.log({
        branchId: scrap.branchId,
        actorUserId: user.id,
        entityType: "scrap_soft_hold",
        entityId: activeHold.id,
        action: AuditAction.STATUS_CHANGE,
        beforeJson: { status: "ACTIVE" },
        afterJson: { status: "CONVERTED", allocationId: allocation.id }
      });
    }

    await this.auditRepo.log({
      branchId: scrap.branchId,
      actorUserId: user.id,
      entityType: "sale_line_scrap_allocation",
      entityId: allocation.id,
      action: AuditAction.CREATE,
      afterJson: {
        saleLineId: input.saleLineId,
        saleLinePieceId: input.saleLinePieceId,
        scrapId: input.scrapId
      }
    });

    return allocation;
  }

  async releaseAllocation(input: { saleLineId: string; releasedByEmail: string }) {
    const allocation = await this.prisma.saleLineScrapAllocation.findFirst({
      where: { saleLineId: input.saleLineId, isActive: true },
      orderBy: { allocatedAt: "asc" }
    });
    if (!allocation) throw new AppNotFoundError("No existe una asignación activa para esta línea de venta.");

    return this.releasePieceAllocation({
      saleLineId: input.saleLineId,
      saleLinePieceId: allocation.saleLinePieceId,
      releasedByEmail: input.releasedByEmail
    });
  }

  async releasePieceAllocation(input: {
    saleLineId: string;
    saleLinePieceId: string;
    releasedByEmail: string;
  }) {
    const user = await this.prisma.appUser.findUnique({ where: { email: input.releasedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const allocation = await this.prisma.saleLineScrapAllocation.findFirst({
      where: {
        saleLineId: input.saleLineId,
        saleLinePieceId: input.saleLinePieceId,
        isActive: true
      },
      include: { scrap: true }
    });
    if (!allocation) throw new AppNotFoundError("No existe una asignación activa para esta pieza de venta.");

    const saleLine = await this.prisma.saleLine.findUnique({
      where: { id: input.saleLineId },
      include: { sale: true }
    });
    if (!saleLine) throw new AppNotFoundError("Línea de venta no encontrada.");
    if (!canManuallyAllocateScrap(saleLine.sale.status)) {
      throw new AppValidationError("Solo se puede liberar una asignación de líneas en estado DRAFT o CONFIRMED.");
    }

    const releasedAt = new Date();
    await this.prisma.saleLineScrapAllocation.update({
      where: { id: allocation.id },
      data: { isActive: false, releasedAt }
    });
    await this.auditRepo.log({
      branchId: allocation.scrap.branchId,
      actorUserId: user.id,
      entityType: "sale_line_scrap_allocation",
      entityId: allocation.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { isActive: true, saleLinePieceId: input.saleLinePieceId },
      afterJson: {
        isActive: false,
        saleLinePieceId: input.saleLinePieceId,
        releasedAt: releasedAt.toISOString()
      }
    });
  }

  async commitAutoAssignment(input: {
    saleId: string;
    allocatedByEmail: string;
    items: Array<{ saleLineId: string; saleLinePieceId: string; scrapId: string }>;
  }) {
    const user = await this.prisma.appUser.findUnique({ where: { email: input.allocatedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");
    if (input.items.length === 0) throw new AppValidationError("No hay items para autoasignar.");

    const uniquePieceIds = new Set(input.items.map((item) => item.saleLinePieceId));
    const uniqueScrapIds = new Set(input.items.map((item) => item.scrapId));
    if (uniquePieceIds.size !== input.items.length) throw new AppValidationError("La propuesta repite piezas.");
    if (uniqueScrapIds.size !== input.items.length) throw new AppValidationError("La propuesta repite retazos.");

    const sale = await this.prisma.sale.findUnique({ where: { id: input.saleId } });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");
    if (sale.status !== "DRAFT") {
      throw new AppValidationError("La autoasignación solo está disponible para ventas DRAFT.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const pieces = await tx.saleLinePiece.findMany({
        where: { id: { in: [...uniquePieceIds] }, saleLine: { saleId: input.saleId } },
        include: {
          saleLine: true,
          allocations: { where: { isActive: true }, select: { id: true } }
        }
      });
      if (pieces.length !== input.items.length) {
        throw new AppValidationError("La propuesta contiene piezas inválidas para esta venta.");
      }
      if (pieces.some((piece) => piece.allocations.length > 0)) {
        throw new AppConflictError("Al menos una pieza ya tiene un retazo asignado. Recalcula la autoasignación.");
      }

      const scraps = await tx.scrap.findMany({
        where: { id: { in: [...uniqueScrapIds] } }
      });
      if (scraps.length !== input.items.length) {
        throw new AppValidationError("La propuesta contiene retazos inválidos.");
      }
      if (scraps.some((scrap) => scrap.status !== ScrapStatus.STORED)) {
        throw new AppConflictError("Al menos un retazo ya no está disponible. Recalcula la autoasignación.");
      }

      const activeAllocations = await tx.saleLineScrapAllocation.findMany({
        where: { scrapId: { in: [...uniqueScrapIds] }, isActive: true },
        select: { scrapId: true }
      });
      if (activeAllocations.length > 0) {
        throw new AppConflictError("Al menos un retazo ya fue asignado por otro contexto. Recalcula la autoasignación.");
      }

      const activeHolds = await tx.scrapSoftHold.findMany({
        where: {
          scrapId: { in: [...uniqueScrapIds] },
          status: SoftHoldStatus.ACTIVE,
          expiresAt: { gt: new Date() }
        }
      });
      const foreignHold = activeHolds.find((hold) => hold.heldBy !== user.id);
      if (foreignHold) {
        throw new AppConflictError("Al menos un retazo está reservado temporalmente por otro usuario.");
      }

      const created = [];
      for (const item of input.items) {
        const allocation = await tx.saleLineScrapAllocation.create({
          data: {
            saleLineId: item.saleLineId,
            saleLinePieceId: item.saleLinePieceId,
            scrapId: item.scrapId,
            allocatedBy: user.id,
            allocatedAt: new Date()
          }
        });
        created.push(allocation);
      }

      if (activeHolds.length > 0) {
        await tx.scrapSoftHold.updateMany({
          where: { id: { in: activeHolds.map((hold) => hold.id) } },
          data: { status: SoftHoldStatus.CONVERTED, convertedAt: new Date() }
        });
      }

      return created;
    });

    for (const allocation of result) {
      await this.auditRepo.log({
        branchId: sale.branchId,
        actorUserId: user.id,
        entityType: "sale_line_scrap_allocation",
        entityId: allocation.id,
        action: AuditAction.CREATE,
        afterJson: {
          saleId: input.saleId,
          saleLineId: allocation.saleLineId,
          saleLinePieceId: allocation.saleLinePieceId,
          scrapId: allocation.scrapId,
          source: "AUTO_ASSIGNMENT"
        }
      });
    }

    return { ok: true, assignedCount: result.length };
  }
}

function canManuallyAllocateScrap(status: string): boolean {
  return status === "DRAFT" || status === "CONFIRMED";
}
