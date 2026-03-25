import { Injectable } from "@nestjs/common";
import { AuditAction, PrismaClient, ScrapStatus } from "@prisma/client";
import { AppConflictError, AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";

const ACTIVE_STORAGE_SCRAP_STATUSES = [
  ScrapStatus.PENDING_CLASSIFICATION,
  ScrapStatus.PENDING_STORAGE,
  ScrapStatus.PENDING_INBOUND,
  ScrapStatus.STORED
];

@Injectable()
export class ScrapStorageLocationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async createStorageLocation(input: {
    branchCode: string;
    createdByEmail: string;
    code: string;
    description?: string;
  }) {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    const user = await this.prisma.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !user) throw new AppNotFoundError("Sucursal o usuario no encontrado.");

    this.validateLocationCode(input.code);
    if (input.description && input.description.length > 160) {
      throw new AppValidationError("La descripción no puede superar los 160 caracteres");
    }

    const existing = await this.prisma.storageLocation.findFirst({
      where: { branchId: branch.id, code: input.code }
    });
    if (existing) throw new AppConflictError("El código ya existe en esta sucursal");

    const location = await this.prisma.storageLocation.create({
      data: {
        branchId: branch.id,
        code: input.code,
        description: input.description,
        createdBy: user.id
      }
    });

    await this.auditRepo.log({
      branchId: branch.id,
      actorUserId: user.id,
      entityType: "storage_location",
      entityId: location.id,
      action: AuditAction.CREATE,
      afterJson: { code: location.code, description: location.description ?? null }
    });

    return location;
  }

  async listStorageLocations(branchCode: string, page = 1, limit = 50) {
    const branch = await this.prisma.branch.findUnique({ where: { code: branchCode } });
    if (!branch) return { data: [], total: 0, page, limit, totalPages: 0 };

    const safeLimit = Math.min(limit, 100);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const where = { branchId: branch.id };
    const scrapWhere = { status: { in: ACTIVE_STORAGE_SCRAP_STATUSES } };

    const [locations, total] = await Promise.all([
      this.prisma.storageLocation.findMany({
        where,
        include: { _count: { select: { scraps: { where: scrapWhere } } } },
        orderBy: { code: "asc" },
        skip,
        take: safeLimit
      }),
      this.prisma.storageLocation.count({ where })
    ]);

    return {
      data: locations.map((loc) => ({
        id: loc.id,
        code: loc.code,
        description: loc.description,
        isActive: loc.isActive,
        scrapCountStored: loc._count.scraps,
        canDelete: loc._count.scraps === 0 && loc.isActive
      })),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit)
    };
  }

  async updateStorageLocation(id: string, input: { code?: string; description?: string; actorEmail: string }) {
    const existing = await this.prisma.storageLocation.findUnique({
      where: { id },
      include: { scraps: { where: { status: { in: ACTIVE_STORAGE_SCRAP_STATUSES } } } }
    });
    if (!existing) throw new AppNotFoundError("Ubicación no encontrada.");

    const user = await this.prisma.appUser.findUnique({ where: { email: input.actorEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    if (input.code && input.code !== existing.code) {
      if (existing.scraps.length > 0) {
        throw new AppConflictError("No se puede cambiar el código: la ubicación tiene stock activo");
      }
      this.validateLocationCode(input.code);
      const duplicate = await this.prisma.storageLocation.findFirst({
        where: { branchId: existing.branchId, code: input.code }
      });
      if (duplicate) throw new AppConflictError("El código ya existe en esta sucursal");
    }

    if (input.description !== undefined && input.description.length > 160) {
      throw new AppValidationError("La descripción no puede superar los 160 caracteres");
    }

    const updated = await this.prisma.storageLocation.update({
      where: { id },
      data: {
        code: input.code ?? existing.code,
        description: input.description !== undefined ? input.description : existing.description
      }
    });

    await this.auditRepo.log({
      branchId: existing.branchId,
      actorUserId: user.id,
      entityType: "storage_location",
      entityId: id,
      action: AuditAction.UPDATE,
      beforeJson: { code: existing.code, description: existing.description },
      afterJson: { code: updated.code, description: updated.description }
    });

    return updated;
  }

  async deleteStorageLocation(id: string, actorEmail: string) {
    const existing = await this.prisma.storageLocation.findUnique({
      where: { id },
      include: { scraps: { where: { status: { in: ACTIVE_STORAGE_SCRAP_STATUSES } } } }
    });
    if (!existing) throw new AppNotFoundError("Ubicación no encontrada.");
    if (existing.scraps.length > 0) {
      throw new AppConflictError("No se puede eliminar: la ubicación tiene stock activo");
    }

    const user = await this.prisma.appUser.findUnique({ where: { email: actorEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    await this.prisma.storageLocation.delete({ where: { id } });
    await this.auditRepo.log({
      branchId: existing.branchId,
      actorUserId: user.id,
      entityType: "storage_location",
      entityId: id,
      action: AuditAction.DELETE,
      beforeJson: { code: existing.code, description: existing.description }
    });
  }

  async toggleStorageLocationStatus(id: string, actorEmail: string) {
    const existing = await this.prisma.storageLocation.findUnique({ where: { id } });
    if (!existing) throw new AppNotFoundError("Ubicación no encontrada.");

    const user = await this.prisma.appUser.findUnique({ where: { email: actorEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const newStatus = !existing.isActive;
    if (newStatus === false) {
      const activeCount = await this.prisma.scrap.count({
        where: {
          locationId: id,
          status: { in: ACTIVE_STORAGE_SCRAP_STATUSES }
        }
      });
      if (activeCount > 0) {
        throw new AppConflictError("No se puede desactivar: la ubicación tiene stock activo");
      }
    }

    const updated = await this.prisma.storageLocation.update({
      where: { id },
      data: { isActive: newStatus }
    });

    await this.auditRepo.log({
      branchId: existing.branchId,
      actorUserId: user.id,
      entityType: "storage_location",
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { isActive: existing.isActive },
      afterJson: { isActive: newStatus }
    });

    return updated;
  }

  async assignLocation(input: { scrapId: string; locationCode: string; classifiedByEmail: string }) {
    const scrap = await this.prisma.scrap.findUnique({ where: { id: input.scrapId } });
    if (!scrap) throw new AppNotFoundError("Retazo no encontrado.");

    const user = await this.prisma.appUser.findUnique({ where: { email: input.classifiedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const location = await this.prisma.storageLocation.findFirst({
      where: { branchId: scrap.branchId, code: input.locationCode, isActive: true }
    });
    if (!location) throw new AppNotFoundError("Ubicación no encontrada.");

    if (scrap.status !== ScrapStatus.PENDING_STORAGE && scrap.status !== ScrapStatus.PENDING_INBOUND) {
      throw new AppValidationError("Solo los retazos en estado pendiente pueden ser asignados.");
    }

    const updated = await this.prisma.scrap.update({
      where: { id: scrap.id },
      data: {
        locationId: location.id,
        status: ScrapStatus.STORED,
        classifiedBy: user.id,
        classifiedAt: new Date()
      }
    });
    await this.auditRepo.log({
      branchId: scrap.branchId,
      actorUserId: user.id,
      entityType: "scrap",
      entityId: scrap.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: scrap.status, locationId: scrap.locationId },
      afterJson: { status: updated.status, locationId: updated.locationId }
    });
    return updated;
  }

  async bulkPreviewStorageLocations(input: {
    branchCode: string;
    rowMode: "LETTER" | "FIXED";
    rowStart: string;
    rowEnd: string;
    colStart: number;
    colEnd: number;
    separator: string;
    descriptionTemplate?: string;
  }) {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new AppNotFoundError("Sucursal no encontrada.");

    const generatedCodes = this.generateCodes(input);
    const existing = await this.prisma.storageLocation.findMany({
      where: {
        branchId: branch.id,
        code: { in: generatedCodes }
      },
      select: { code: true }
    });

    const existingCodes = new Set(existing.map((loc) => loc.code));
    const newCodes = generatedCodes.filter((code) => !existingCodes.has(code));
    const sample = newCodes.length <= 15
      ? newCodes
      : [...newCodes.slice(0, 10), ...newCodes.slice(-5)];

    return {
      totalToGenerate: generatedCodes.length,
      existingCount: existingCodes.size,
      newCount: newCodes.length,
      sample
    };
  }

  async bulkCreateStorageLocations(input: {
    branchCode: string;
    rowMode: "LETTER" | "FIXED";
    rowStart: string;
    rowEnd: string;
    colStart: number;
    colEnd: number;
    separator: string;
    descriptionTemplate?: string;
    createdByEmail: string;
  }) {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new AppNotFoundError("Sucursal no encontrada.");

    const user = await this.prisma.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const generatedLocations = this.generateCodes(input).map((code) => ({
      code,
      description: input.descriptionTemplate
        ? this.buildDescription(input.descriptionTemplate, code, input.separator)
        : undefined
    }));

    const allCodes = generatedLocations.map((item) => item.code);
    const existing = await this.prisma.storageLocation.findMany({
      where: { branchId: branch.id, code: { in: allCodes } },
      select: { code: true }
    });
    const existingCodes = new Set(existing.map((loc) => loc.code));
    const toCreate = generatedLocations.filter((item) => !existingCodes.has(item.code));

    await this.prisma.storageLocation.createMany({
      data: toCreate.map((item) => ({
        branchId: branch.id,
        code: item.code,
        description: item.description ?? null,
        createdBy: user.id
      }))
    });

    await this.auditRepo.log({
      branchId: branch.id,
      actorUserId: user.id,
      entityType: "storage_location",
      entityId: branch.id,
      action: AuditAction.CREATE,
      afterJson: {
        bulkCreate: true,
        created: toCreate.length,
        skipped: existingCodes.size
      }
    });

    return {
      created: toCreate.length,
      skipped: existingCodes.size,
      total: generatedLocations.length
    };
  }

  private validateLocationCode(code: string) {
    if (!/^[A-Za-z0-9-]+$/.test(code)) {
      throw new AppValidationError("El código solo puede contener letras, números y guiones");
    }
    if (code.length > 20) {
      throw new AppValidationError("El código no puede superar los 20 caracteres");
    }
  }

  private generateCodes(input: {
    rowMode: "LETTER" | "FIXED";
    rowStart: string;
    rowEnd: string;
    colStart: number;
    colEnd: number;
    separator: string;
  }) {
    const colCount = input.colEnd - input.colStart + 1;
    if (colCount > 500) throw new AppValidationError("La cantidad de columnas supera el máximo permitido (500)");

    const generatedCodes: string[] = [];
    if (input.rowMode === "LETTER") {
      const startCode = input.rowStart.charCodeAt(0);
      const endCode = input.rowEnd.charCodeAt(0);
      if (startCode > endCode) throw new AppValidationError("rowStart debe ser menor o igual a rowEnd");
      const rowCount = endCode - startCode + 1;
      if (rowCount > 26) throw new AppValidationError("El modo de fila LETRA soporta máximo 26 filas (A-Z)");

      for (let i = startCode; i <= endCode; i++) {
        const row = String.fromCharCode(i);
        for (let col = input.colStart; col <= input.colEnd; col++) {
          generatedCodes.push(`${row}${input.separator}${col}`);
        }
      }
    } else {
      const rows = generateFixedRows(input.rowStart, input.rowEnd);
      for (const row of rows) {
        for (let col = input.colStart; col <= input.colEnd; col++) {
          generatedCodes.push(`${row}${input.separator}${col}`);
        }
      }
    }

    if (generatedCodes.length > 2000) {
      throw new AppValidationError("El total de códigos superaría el máximo permitido (2000)");
    }

    return generatedCodes;
  }

  private buildDescription(template: string, code: string, separator: string) {
    const [row, col] = code.split(separator);
    return template.replace("{row}", row).replace("{col}", col ?? "");
  }
}

function generateFixedRows(rowStart: string, rowEnd: string): string[] {
  if (rowStart.includes(",") || rowEnd.includes(",")) {
    const rows: string[] = [];
    const startRows = rowStart.split(",").map((row) => row.trim());
    const endRows = rowEnd.split(",").map((row) => row.trim());
    rows.push(...startRows);
    if (rowEnd !== rowStart) {
      rows.push(...endRows);
    }
    return [...new Set(rows)];
  }
  return [rowStart];
}
