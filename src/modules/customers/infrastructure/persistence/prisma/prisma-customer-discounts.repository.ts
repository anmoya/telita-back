import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { AppConflictError, AppNotFoundError, AppValidationError } from "../../../../../shared/application/errors/app-error";

@Injectable()
export class PrismaCustomerDiscountsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByCustomer(customerId: string) {
    return this.prisma.customerDiscount.findMany({
      where: { customerId },
      include: { createdByUser: { select: { email: true, fullName: true } } },
      orderBy: { validFrom: "desc" }
    });
  }

  async findActiveForDate(customerId: string, effectiveDate: Date) {
    const dateOnly = effectiveDate.toISOString().slice(0, 10);
    return this.prisma.customerDiscount.findFirst({
      where: {
        customerId,
        isActive: true,
        validFrom: { lte: new Date(dateOnly) },
        OR: [
          { validTo: null },
          { validTo: { gte: new Date(dateOnly) } }
        ]
      },
      orderBy: { validFrom: "desc" }
    });
  }

  async create(input: {
    customerId: string;
    createdByEmail: string;
    discountCode?: string;
    discountPct: number;
    reason?: string;
    validFrom: string;
    validTo?: string;
  }) {
    const user = await this.prisma.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    if (input.discountPct < 0 || input.discountPct > 100) throw new AppValidationError("El porcentaje debe estar entre 0 y 100.");
    if (input.validTo && input.validTo < input.validFrom) throw new AppValidationError("La fecha 'hasta' no puede ser anterior a la fecha 'desde'.");

    await this.checkOverlap(input.customerId, input.validFrom, input.validTo ?? null, null);

    return this.prisma.customerDiscount.create({
      data: {
        customerId: input.customerId,
        discountCode: input.discountCode?.trim() || null,
        discountPct: input.discountPct,
        reason: input.reason?.trim() || null,
        validFrom: new Date(input.validFrom),
        validTo: input.validTo ? new Date(input.validTo) : null,
        isActive: true,
        createdBy: user.id
      }
    });
  }

  async update(id: string, input: {
    discountCode?: string;
    discountPct?: number;
    reason?: string;
    validFrom?: string;
    validTo?: string | null;
  }) {
    const existing = await this.prisma.customerDiscount.findUnique({ where: { id } });
    if (!existing) throw new AppNotFoundError("Descuento no encontrado.");

    if (input.discountPct !== undefined && (input.discountPct < 0 || input.discountPct > 100)) {
      throw new AppValidationError("El porcentaje debe estar entre 0 y 100.");
    }

    const validFrom = input.validFrom ?? existing.validFrom.toISOString().slice(0, 10);
    const validTo = input.validTo !== undefined ? input.validTo : (existing.validTo?.toISOString().slice(0, 10) ?? null);
    if (validTo && validTo < validFrom) throw new AppValidationError("La fecha 'hasta' no puede ser anterior a la fecha 'desde'.");

    await this.checkOverlap(existing.customerId, validFrom, validTo, id);

    const data: Prisma.CustomerDiscountUpdateInput = {};
    if (input.discountCode !== undefined) data.discountCode = input.discountCode.trim() || null;
    if (input.discountPct !== undefined) data.discountPct = input.discountPct;
    if (input.reason !== undefined) data.reason = input.reason.trim() || null;
    if (input.validFrom !== undefined) data.validFrom = new Date(input.validFrom);
    if (input.validTo !== undefined) data.validTo = input.validTo ? new Date(input.validTo) : null;

    return this.prisma.customerDiscount.update({ where: { id }, data });
  }

  async deactivate(id: string) {
    const existing = await this.prisma.customerDiscount.findUnique({ where: { id } });
    if (!existing) throw new AppNotFoundError("Descuento no encontrado.");
    return this.prisma.customerDiscount.update({
      where: { id },
      data: { isActive: false }
    });
  }

  private async checkOverlap(customerId: string, validFrom: string, validTo: string | null, excludeId: string | null) {
    const overlapping = await this.prisma.customerDiscount.findFirst({
      where: {
        customerId,
        isActive: true,
        id: excludeId ? { not: excludeId } : undefined,
        validFrom: validTo ? { lte: new Date(validTo) } : undefined,
        OR: [
          { validTo: null },
          { validTo: { gte: new Date(validFrom) } }
        ]
      }
    });
    if (overlapping) {
      throw new AppConflictError("Ya existe un descuento activo que se solapa con el periodo indicado.");
    }
  }
}
