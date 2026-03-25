import { Injectable } from "@nestjs/common";
import { AuditAction, CutJobStatus, PrismaClient, SaleStatus, ScrapStatus, SoftHoldStatus } from "@prisma/client";
import { AppConflictError, AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";

@Injectable()
export class SalesLifecycleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async recomputeTotals(saleId: string, tx: SalesTotalsTx = this.prisma) {
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (!sale) return;

    const lines = await tx.saleLine.findMany({ where: { saleId } });
    const linesSubtotal = round2(lines.reduce((acc, line) => acc + Number(line.lineTotal), 0));
    const commercialAdjPct = Number(sale.commercialAdjustmentPct);
    const commercialAdj = round2(linesSubtotal * (commercialAdjPct / 100));
    const installation = Number(sale.installationAmount);
    const subtotal = round2(linesSubtotal + commercialAdj + installation);
    const tax = round2(subtotal * 0.19);
    const total = roundClpCash(subtotal + tax);
    const balanceDue = Math.max(total - Number(sale.amountPaid), 0);

    await tx.sale.update({
      where: { id: saleId },
      data: { commercialAdjustmentAmount: commercialAdj, subtotalAmount: subtotal, taxAmount: tax, totalAmount: total, balanceDue }
    });
  }

  async confirm(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: {
          include: {
            pieces: {
              include: {
                allocations: { where: { isActive: true }, select: { id: true, scrapId: true } }
              }
            }
          }
        }
      }
    });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");
    if (sale.status !== SaleStatus.DRAFT) throw new AppValidationError("Solo se puede confirmar una venta en estado DRAFT.");
    if (sale.lines.length === 0) throw new AppValidationError("No se puede confirmar una venta sin líneas.");
    if (!sale.customerId) {
      throw new AppValidationError("Debe seleccionar un cliente del maestro para confirmar la venta.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id: sale.id }, data: { status: SaleStatus.CONFIRMED } });

      for (const line of sale.lines) {
        const allocations = line.pieces.flatMap((piece) => piece.allocations);
        for (const allocation of allocations) {
          await tx.scrap.update({ where: { id: allocation.scrapId }, data: { status: ScrapStatus.USED } });
        }

        if (allocations.length < line.pieces.length) {
          const exists = await tx.cutJob.findFirst({ where: { saleLineId: line.id } });
          if (!exists) {
            await tx.cutJob.create({ data: { saleLineId: line.id, status: CutJobStatus.PENDING } });
          }
        }
      }
    });

    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: sale.createdBy,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: sale.status },
      afterJson: { status: SaleStatus.CONFIRMED }
    });
  }

  async cancel(saleId: string, canceledReason?: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: {
          include: {
            pieces: {
              include: {
                allocations: { where: { isActive: true }, select: { id: true, scrapId: true } }
              }
            }
          }
        }
      }
    });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");

    const lineIds = sale.lines.map((line) => line.id);
    if (lineIds.length > 0) {
      const blocked = await this.prisma.cutJob.findFirst({
        where: { saleLineId: { in: lineIds }, status: { in: [CutJobStatus.CUT, CutJobStatus.DELIVERED] } }
      });
      if (blocked) throw new AppConflictError("No se puede anular la venta porque el corte ya fue ejecutado.");
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of sale.lines) {
        for (const allocation of line.pieces.flatMap((piece) => piece.allocations)) {
          const scrap = await tx.scrap.findUnique({ where: { id: allocation.scrapId } });
          if (scrap?.status === ScrapStatus.USED) {
            await tx.scrap.update({ where: { id: allocation.scrapId }, data: { status: ScrapStatus.STORED } });
          }
          await tx.saleLineScrapAllocation.update({
            where: { id: allocation.id },
            data: { isActive: false, releasedAt: new Date() }
          });
        }
      }

      await tx.scrapSoftHold.updateMany({
        where: { saleId: sale.id, status: SoftHoldStatus.ACTIVE },
        data: { status: SoftHoldStatus.RELEASED, releasedAt: new Date() }
      });
      await tx.sale.update({ where: { id: sale.id }, data: { status: SaleStatus.CANCELED, canceledReason } });
    });

    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: sale.createdBy,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: sale.status },
      afterJson: { status: SaleStatus.CANCELED, canceledReason: canceledReason ?? null }
    });
  }
}

type SalesTotalsTx = Pick<PrismaClient, "sale" | "saleLine">;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function roundClpCash(value: number): number {
  const integer = Math.round(value);
  const remainder = integer % 10;
  const base = integer - remainder;
  return remainder <= 5 ? base : base + 10;
}
