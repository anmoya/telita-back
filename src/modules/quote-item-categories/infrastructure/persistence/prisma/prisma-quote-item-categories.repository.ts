import { Injectable } from "@nestjs/common";
import { AuditAction, PrismaClient } from "@prisma/client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

@Injectable()
export class PrismaQuoteItemCategoriesRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async list(params: { branchCode: string; isActive?: boolean }) {
    const branch = await this.prisma.branch.findUnique({ where: { code: params.branchCode } });
    if (!branch) throw new Error("Sucursal no encontrada.");

    return this.prisma.quoteItemCategory.findMany({
      where: {
        branchId: branch.id,
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {})
      },
      orderBy: { name: "asc" }
    });
  }

  async create(input: { branchCode: string; name: string; createdByEmail: string }) {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    const createdBy = await this.prisma.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !createdBy) throw new Error("Sucursal o usuario no encontrado.");

    const normalizedName = input.name.trim().toUpperCase();
    if (!normalizedName) throw new Error("El nombre de la categoría es obligatorio.");

    const existing = await this.prisma.quoteItemCategory.findFirst({
      where: { branchId: branch.id, name: { equals: normalizedName, mode: "insensitive" } }
    });
    if (existing) throw new Error("La categoría ya existe en esta sucursal.");

    const category = await this.prisma.quoteItemCategory.create({
      data: {
        branchId: branch.id,
        name: normalizedName,
        isActive: true,
        createdBy: createdBy.id
      }
    });

    await this.auditRepo.log({
      branchId: branch.id,
      actorUserId: createdBy.id,
      entityType: "quote_item_category",
      entityId: category.id,
      action: AuditAction.CREATE,
      afterJson: { name: category.name, isActive: category.isActive }
    });

    return category;
  }

  async update(input: { id: string; name?: string; isActive?: boolean; updatedByEmail: string }) {
    const updatedBy = await this.prisma.appUser.findUnique({ where: { email: input.updatedByEmail } });
    if (!updatedBy) throw new Error("Usuario no encontrado.");

    const category = await this.prisma.quoteItemCategory.findUnique({ where: { id: input.id } });
    if (!category) throw new Error("Categoría no encontrada.");

    const updateData: { name?: string; isActive?: boolean } = {};
    if (input.name !== undefined) {
      const normalizedName = input.name.trim().toUpperCase();
      if (!normalizedName) throw new Error("El nombre de la categoría es obligatorio.");
      const conflict = await this.prisma.quoteItemCategory.findFirst({
        where: {
          branchId: category.branchId,
          name: { equals: normalizedName, mode: "insensitive" },
          id: { not: input.id }
        }
      });
      if (conflict) throw new Error("El nombre de la categoría ya existe en esta sucursal.");
      updateData.name = normalizedName;
    }
    if (input.isActive !== undefined) {
      updateData.isActive = input.isActive;
    }

    const updated = await this.prisma.quoteItemCategory.update({
      where: { id: input.id },
      data: updateData
    });

    await this.auditRepo.log({
      branchId: updated.branchId,
      actorUserId: updatedBy.id,
      entityType: "quote_item_category",
      entityId: updated.id,
      action: AuditAction.UPDATE,
      beforeJson: { name: category.name, isActive: category.isActive },
      afterJson: { name: updated.name, isActive: updated.isActive }
    });

    return updated;
  }

  async findOrCreate(input: { branchId: string; name: string; createdByEmail: string }) {
    const normalizedName = input.name.trim().toUpperCase();
    const existing = await this.prisma.quoteItemCategory.findFirst({
      where: { branchId: input.branchId, name: { equals: normalizedName, mode: "insensitive" } }
    });
    if (existing) return existing;

    const createdBy = await this.prisma.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!createdBy) throw new Error("Usuario no encontrado.");

    const category = await this.prisma.quoteItemCategory.create({
      data: {
        branchId: input.branchId,
        name: normalizedName,
        isActive: true,
        createdBy: createdBy.id
      }
    });

    await this.auditRepo.log({
      branchId: input.branchId,
      actorUserId: createdBy.id,
      entityType: "quote_item_category",
      entityId: category.id,
      action: AuditAction.CREATE,
      afterJson: { name: category.name, isActive: category.isActive, auto: true }
    });

    return category;
  }
}
