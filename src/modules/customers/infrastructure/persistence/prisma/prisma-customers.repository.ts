import { Injectable } from "@nestjs/common";
import { AuditAction, PrismaClient } from "@prisma/client";
import { AppConflictError, AppNotFoundError, AppValidationError } from "../../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { normalizeRut, validateRut } from "../../../../../shared/utils/rut";

export type CustomerPayload = {
  branchCode: string;
  fullName: string;
  rut?: string | null;
  phone?: string | null;
  email?: string | null;
  companyOrReference?: string | null;
  preferredPriceListName?: string | null;
  discountCode?: string | null;
  discountPct?: number;
  notes?: string | null;
};

@Injectable()
export class PrismaCustomersRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async list(params: { branchCode: string; q?: string; isActive?: boolean }) {
    return this.prisma.customer.findMany({
      where: {
        branch: { code: params.branchCode },
        isActive: params.isActive,
        OR: params.q
          ? [
              { fullName: { contains: params.q, mode: "insensitive" } },
              { code: { contains: params.q, mode: "insensitive" } },
              { rut: { contains: params.q, mode: "insensitive" } },
              { companyOrReference: { contains: params.q, mode: "insensitive" } },
              { discountCode: { contains: params.q, mode: "insensitive" } }
            ]
          : undefined
      },
      include: {
        preferredPriceList: { select: { name: true } }
      },
      orderBy: [{ fullName: "asc" }]
    });
  }

  async findById(id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: {
        branch: { select: { code: true, name: true } },
        preferredPriceList: { select: { id: true, name: true } }
      }
    });
  }

  async create(input: CustomerPayload, actorUserId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new AppNotFoundError("Sucursal no encontrada.");

    const preferredPriceListId = await resolvePreferredPriceListId(this.prisma, branch.id, input.preferredPriceListName);
    const code = await this.getNextCustomerCode(branch.id);

    const normalizedRut = await this.resolveAndValidateRut(input.rut, branch.id);

    const customer = await this.prisma.customer.create({
      data: {
        branchId: branch.id,
        code,
        rut: normalizedRut,
        fullName: input.fullName.trim(),
        phone: normalizeNullable(input.phone),
        email: normalizeNullable(input.email),
        companyOrReference: normalizeNullable(input.companyOrReference),
        preferredPriceListId,
        discountCode: normalizeUpperNullable(input.discountCode),
        discountPct: normalizeDiscount(input.discountPct),
        notes: normalizeNullable(input.notes)
      },
      include: { preferredPriceList: { select: { name: true } } }
    });

    await this.auditRepo.log({
      branchId: branch.id,
      actorUserId,
      entityType: "customer",
      entityId: customer.id,
      action: AuditAction.CREATE,
      afterJson: {
        code: customer.code,
        rut: customer.rut,
        fullName: customer.fullName,
        discountCode: customer.discountCode,
        discountPct: Number(customer.discountPct)
      }
    });

    return customer;
  }

  async update(id: string, input: Partial<Omit<CustomerPayload, "branchCode">>, actorUserId: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new AppNotFoundError("Cliente no encontrado.");

    const preferredPriceListId =
      input.preferredPriceListName === undefined
        ? existing.preferredPriceListId
        : await resolvePreferredPriceListId(this.prisma, existing.branchId, input.preferredPriceListName);

    const normalizedRut = input.rut !== undefined
      ? await this.resolveAndValidateRut(input.rut, existing.branchId, id)
      : undefined;

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        rut: normalizedRut,
        fullName: input.fullName ? input.fullName.trim() : existing.fullName,
        phone: input.phone !== undefined ? normalizeNullable(input.phone) : undefined,
        email: input.email !== undefined ? normalizeNullable(input.email) : undefined,
        companyOrReference:
          input.companyOrReference !== undefined ? normalizeNullable(input.companyOrReference) : undefined,
        preferredPriceListId,
        discountCode: input.discountCode !== undefined ? normalizeUpperNullable(input.discountCode) : undefined,
        discountPct: input.discountPct !== undefined ? normalizeDiscount(input.discountPct) : undefined,
        notes: input.notes !== undefined ? normalizeNullable(input.notes) : undefined
      },
      include: { preferredPriceList: { select: { name: true } } }
    });

    await this.auditRepo.log({
      branchId: existing.branchId,
      actorUserId,
      entityType: "customer",
      entityId: existing.id,
      action: AuditAction.UPDATE,
      beforeJson: {
        fullName: existing.fullName,
        rut: existing.rut,
        phone: existing.phone,
        email: existing.email,
        companyOrReference: existing.companyOrReference,
        preferredPriceListId: existing.preferredPriceListId,
        discountCode: existing.discountCode,
        discountPct: Number(existing.discountPct),
        notes: existing.notes
      },
      afterJson: {
        fullName: customer.fullName,
        rut: customer.rut,
        phone: customer.phone,
        email: customer.email,
        companyOrReference: customer.companyOrReference,
        preferredPriceListName: customer.preferredPriceList?.name ?? null,
        discountCode: customer.discountCode,
        discountPct: Number(customer.discountPct),
        notes: customer.notes
      }
    });

    return customer;
  }

  async setStatus(id: string, isActive: boolean, actorUserId: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new AppNotFoundError("Cliente no encontrado.");

    const customer = await this.prisma.customer.update({
      where: { id },
      data: { isActive }
    });

    await this.auditRepo.log({
      branchId: existing.branchId,
      actorUserId,
      entityType: "customer",
      entityId: existing.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { isActive: existing.isActive },
      afterJson: { isActive: customer.isActive }
    });

    return customer;
  }

  private async resolveAndValidateRut(
    rut: string | null | undefined,
    branchId: string,
    excludeId?: string
  ): Promise<string | null> {
    if (!rut || !rut.trim()) return null;

    const normalized = normalizeRut(rut);
    if (!validateRut(normalized)) {
      throw new AppValidationError("RUT inválido.");
    }

    const existing = await this.prisma.customer.findFirst({
      where: { branchId, rut: normalized, ...(excludeId ? { id: { not: excludeId } } : {}) }
    });
    if (existing) {
      throw new AppConflictError("Ya existe un cliente con este RUT en esta sucursal.");
    }

    return normalized;
  }

  private async getNextCustomerCode(branchId: string): Promise<string> {
    const last = await this.prisma.customer.findMany({
      where: { branchId, code: { startsWith: "CLI-" } },
      select: { code: true },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    const maxNumber = last.reduce((acc, row) => {
      const value = Number(row.code.replace("CLI-", ""));
      return Number.isFinite(value) ? Math.max(acc, value) : acc;
    }, 0);
    return `CLI-${maxNumber + 1}`;
  }
}

async function resolvePreferredPriceListId(prisma: PrismaClient, branchId: string, preferredPriceListName?: string | null) {
  if (!preferredPriceListName) return null;
  const priceList = await prisma.priceList.findFirst({
    where: { branchId, name: preferredPriceListName, isActive: true },
    select: { id: true }
  });
  if (!priceList) throw new AppNotFoundError("Lista de precios preferida no encontrada.");
  return priceList.id;
}

function normalizeNullable(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeUpperNullable(value?: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function normalizeDiscount(value?: number) {
  const discount = Number(value ?? 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    throw new AppValidationError("discountPct debe estar entre 0 y 100.");
  }
  return discount;
}
