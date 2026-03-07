import { AuditAction, ScrapStatus } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

export class PrismaScrapsRepository {
  private readonly auditRepo = new PrismaAuditRepository();

  async registerFromQuote(input: { quoteId: string; generatedByEmail: string }) {
    const quote = await prismaClient.quote.findUnique({
      where: { id: input.quoteId },
      include: {
        sku: {
          include: {
            widthUnit: true,
            lengthUnit: true
          }
        }
      }
    });
    if (!quote) throw new Error("Cotización no encontrada.");

    const generatedBy = await prismaClient.appUser.findUnique({ where: { email: input.generatedByEmail } });
    if (!generatedBy) throw new Error("Usuario no encontrado.");

    const skuWidthM = Number(quote.sku.widthValue) * Number(quote.sku.widthUnit.toMeterFactor);
    const skuLengthM = Number(quote.sku.lengthValue) * Number(quote.sku.lengthUnit.toMeterFactor);
    const skuArea = skuWidthM * skuLengthM;

    const requestedArea =
      Number(quote.requestedWidthM) * Number(quote.requestedHeightM) * Number(quote.quantity);

    const scrapArea = Math.max(skuArea - requestedArea, 0);
    const scrapHeight = skuWidthM > 0 ? scrapArea / skuWidthM : 0;

    const threshold = await this.getGlobalThresholdArea(quote.branchId);
    const status = scrapArea >= threshold && scrapArea > 0 ? ScrapStatus.PENDING_STORAGE : ScrapStatus.DISCARDED;

    const scrap = await prismaClient.scrap.create({
      data: {
        branchId: quote.branchId,
        skuId: quote.skuId,
        quoteId: quote.id,
        widthM: skuWidthM,
        heightM: scrapHeight,
        areaM2: scrapArea,
        status,
        generatedBy: generatedBy.id
      }
    });
    await this.auditRepo.log({
      branchId: quote.branchId,
      actorUserId: generatedBy.id,
      entityType: "scrap",
      entityId: scrap.id,
      action: AuditAction.CREATE,
      afterJson: {
        quoteId: quote.id,
        status: scrap.status,
        areaM2: Number(scrap.areaM2)
      }
    });

    return scrap;
  }

  async match(params: {
    branchCode: string;
    skuCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    limit?: number;
  }) {
    const scraps = await prismaClient.scrap.findMany({
      where: {
        status: ScrapStatus.STORED,
        branch: { code: params.branchCode },
        sku: { code: params.skuCode },
        widthM: { gte: params.requestedWidthM },
        heightM: { gte: params.requestedHeightM },
        allocations: { none: { isActive: true } }
      },
      include: { sku: true, location: true },
      take: params.limit ?? 10
    });

    const requestedArea = params.requestedWidthM * params.requestedHeightM;
    return scraps
      .map((s) => ({ ...s, excessAreaM2: Number(s.areaM2) - requestedArea }))
      .sort((a, b) => a.excessAreaM2 - b.excessAreaM2);
  }

  async allocateToSaleLine(input: { saleLineId: string; scrapId: string; allocatedByEmail: string }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.allocatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const scrap = await prismaClient.scrap.findUnique({ where: { id: input.scrapId } });
    if (!scrap) throw new Error("Retazo no encontrado.");
    if (scrap.status !== ScrapStatus.STORED) throw new Error("El retazo debe estar en estado ALMACENADO para ser asignado.");

    const existing = await prismaClient.saleLineScrapAllocation.findFirst({
      where: { scrapId: input.scrapId, isActive: true }
    });
    if (existing) throw new Error("El retazo ya tiene una asignación activa.");

    const saleLine = await prismaClient.saleLine.findUnique({
      where: { id: input.saleLineId },
      include: { sale: true }
    });
    if (!saleLine) throw new Error("Línea de venta no encontrada.");
    if (saleLine.sale.status !== "DRAFT") throw new Error("Solo se puede asignar a líneas de venta en estado DRAFT.");

    const lineAllocation = await prismaClient.saleLineScrapAllocation.findFirst({
      where: { saleLineId: input.saleLineId, isActive: true }
    });
    if (lineAllocation) throw new Error("La línea de venta ya tiene una asignación activa.");

    const allocation = await prismaClient.saleLineScrapAllocation.create({
      data: {
        saleLineId: input.saleLineId,
        scrapId: input.scrapId,
        allocatedBy: user.id,
        allocatedAt: new Date()
      }
    });
    await this.auditRepo.log({
      branchId: scrap.branchId,
      actorUserId: user.id,
      entityType: "sale_line_scrap_allocation",
      entityId: allocation.id,
      action: AuditAction.CREATE,
      afterJson: { saleLineId: input.saleLineId, scrapId: input.scrapId }
    });
    return allocation;
  }

  async releaseAllocation(input: { saleLineId: string; releasedByEmail: string }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.releasedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const allocation = await prismaClient.saleLineScrapAllocation.findFirst({
      where: { saleLineId: input.saleLineId, isActive: true },
      include: { scrap: true }
    });
    if (!allocation) throw new Error("No existe una asignación activa para esta línea de venta.");

    const saleLine = await prismaClient.saleLine.findUnique({
      where: { id: input.saleLineId },
      include: { sale: true }
    });
    if (!saleLine) throw new Error("Línea de venta no encontrada.");
    if (saleLine.sale.status !== "DRAFT") throw new Error("Solo se puede liberar una asignación de líneas en estado DRAFT.");

    await prismaClient.saleLineScrapAllocation.update({
      where: { id: allocation.id },
      data: { isActive: false, releasedAt: new Date() }
    });
    await this.auditRepo.log({
      branchId: allocation.scrap.branchId,
      actorUserId: user.id,
      entityType: "sale_line_scrap_allocation",
      entityId: allocation.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { isActive: true },
      afterJson: { isActive: false, releasedAt: new Date().toISOString() }
    });
  }

  async registerFromCutJob(input: {
    cutJobId: string;
    saleLineId: string;
    saleLinePieceId?: string;
    branchId: string;
    skuId: string;
    scrapWidthM: number;
    scrapHeightM: number;
    generatedByEmail: string;
  }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.generatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const area = round2(input.scrapWidthM * input.scrapHeightM);
    const threshold = await this.getGlobalThresholdArea(input.branchId);
    const status = area >= threshold && area > 0 ? ScrapStatus.PENDING_STORAGE : ScrapStatus.DISCARDED;

    const scrap = await prismaClient.scrap.create({
      data: {
        branchId: input.branchId,
        skuId: input.skuId,
        cutJobId: input.cutJobId,
        saleLineId: input.saleLineId,
        saleLinePieceId: input.saleLinePieceId,
        widthM: input.scrapWidthM,
        heightM: input.scrapHeightM,
        areaM2: area,
        status,
        generatedBy: user.id
      }
    });
    await this.auditRepo.log({
      branchId: input.branchId,
      actorUserId: user.id,
      entityType: "scrap",
      entityId: scrap.id,
      action: AuditAction.CREATE,
      afterJson: {
        cutJobId: input.cutJobId,
        saleLineId: input.saleLineId,
        saleLinePieceId: input.saleLinePieceId ?? null,
        status: scrap.status,
        areaM2: Number(scrap.areaM2)
      }
    });
    return scrap;
  }

  async getGlobalThresholdArea(branchId: string): Promise<number> {
    const skus = await prismaClient.fabricSku.findMany({
      where: { branchId, isActive: true },
      include: { widthUnit: true, lengthUnit: true }
    });

    const areas = skus
      .map((sku) => {
        const widthM = Number(sku.widthValue) * Number(sku.widthUnit.toMeterFactor);
        const lengthM = Number(sku.lengthValue) * Number(sku.lengthUnit.toMeterFactor);
        return widthM * lengthM;
      })
      .filter((area) => area > 0);

    if (areas.length === 0) return 0;
    return Math.min(...areas);
  }

  async list(params: { branchCode?: string; status?: string }) {
    const status = parseScrapStatus(params.status);
    return prismaClient.scrap.findMany({
      where: {
        branch: params.branchCode ? { code: params.branchCode } : undefined,
        status
      },
      include: {
        location: true,
        sku: true,
        quote: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async createStorageLocation(input: {
    branchCode: string;
    createdByEmail: string;
    code: string;
    description?: string;
  }) {
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    const user = await prismaClient.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !user) throw new Error("Sucursal o usuario no encontrado.");

    // Validate code format: alphanumeric + hyphen only
    if (!/^[A-Za-z0-9-]+$/.test(input.code)) {
      throw new Error("El código solo puede contener letras, números y guiones");
    }
    if (input.code.length > 20) {
      throw new Error("El código no puede superar los 20 caracteres");
    }
    if (input.description && input.description.length > 160) {
      throw new Error("La descripción no puede superar los 160 caracteres");
    }

    // Check unique code per branch
    const existing = await prismaClient.storageLocation.findFirst({
      where: { branchId: branch.id, code: input.code }
    });
    if (existing) throw new Error("El código ya existe en esta sucursal");

    const location = await prismaClient.storageLocation.create({
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
    const branch = await prismaClient.branch.findUnique({ where: { code: branchCode } });
    if (!branch) return { data: [], total: 0, page, limit, totalPages: 0 };

    const safeLimit = Math.min(limit, 100);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const where = { branchId: branch.id };
    const scrapWhere = { status: { in: [ScrapStatus.PENDING_CLASSIFICATION, ScrapStatus.PENDING_STORAGE, ScrapStatus.STORED] } };

    const [locations, total] = await Promise.all([
      prismaClient.storageLocation.findMany({
        where,
        include: { _count: { select: { scraps: { where: scrapWhere } } } },
        orderBy: { code: "asc" },
        skip,
        take: safeLimit
      }),
      prismaClient.storageLocation.count({ where })
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
    const existing = await prismaClient.storageLocation.findUnique({
      where: { id },
      include: { scraps: { where: { status: { in: [ScrapStatus.PENDING_CLASSIFICATION, ScrapStatus.PENDING_STORAGE, ScrapStatus.STORED] } } } }
    });
    if (!existing) throw new Error("Ubicación no encontrada.");

    const user = await prismaClient.appUser.findUnique({ where: { email: input.actorEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    // Validate code if changing
    if (input.code && input.code !== existing.code) {
      if (existing.scraps.length > 0) {
        throw new Error("No se puede cambiar el código: la ubicación tiene stock activo");
      }
      if (!/^[A-Za-z0-9-]+$/.test(input.code)) {
        throw new Error("El código solo puede contener letras, números y guiones");
      }
      if (input.code.length > 20) {
        throw new Error("El código no puede superar los 20 caracteres");
      }
      // Check unique
      const duplicate = await prismaClient.storageLocation.findFirst({
        where: { branchId: existing.branchId, code: input.code }
      });
      if (duplicate) throw new Error("El código ya existe en esta sucursal");
    }

    if (input.description !== undefined && input.description.length > 160) {
      throw new Error("La descripción no puede superar los 160 caracteres");
    }

    const updated = await prismaClient.storageLocation.update({
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
    const existing = await prismaClient.storageLocation.findUnique({
      where: { id },
      include: { scraps: { where: { status: { in: [ScrapStatus.PENDING_CLASSIFICATION, ScrapStatus.PENDING_STORAGE, ScrapStatus.STORED] } } } }
    });
    if (!existing) throw new Error("Ubicación no encontrada.");

    if (existing.scraps.length > 0) {
      throw new Error("No se puede eliminar: la ubicación tiene stock activo");
    }

    const user = await prismaClient.appUser.findUnique({ where: { email: actorEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    await prismaClient.storageLocation.delete({ where: { id } });

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
    const existing = await prismaClient.storageLocation.findUnique({
      where: { id }
    });
    if (!existing) throw new Error("Ubicación no encontrada.");

    const user = await prismaClient.appUser.findUnique({ where: { email: actorEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const newStatus = !existing.isActive;

    // If deactivating, check for active stock
    if (newStatus === false) {
      const activeCount = await prismaClient.scrap.count({
        where: {
          locationId: id,
          status: { in: [ScrapStatus.PENDING_CLASSIFICATION, ScrapStatus.PENDING_STORAGE, ScrapStatus.STORED] }
        }
      });
      if (activeCount > 0) {
        throw new Error("No se puede desactivar: la ubicación tiene stock activo");
      }
    }

    const updated = await prismaClient.storageLocation.update({
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
    const scrap = await prismaClient.scrap.findUnique({ where: { id: input.scrapId } });
    if (!scrap) throw new Error("Retazo no encontrado.");

    const user = await prismaClient.appUser.findUnique({ where: { email: input.classifiedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const location = await prismaClient.storageLocation.findFirst({
      where: { branchId: scrap.branchId, code: input.locationCode, isActive: true }
    });
    if (!location) throw new Error("Ubicación no encontrada.");

    if (scrap.status !== ScrapStatus.PENDING_STORAGE) {
      throw new Error("Solo los retazos en estado PENDIENTE DE ALMACENAMIENTO pueden ser asignados.");
    }

    const updated = await prismaClient.scrap.update({
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
    // Get branch
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new Error("Sucursal no encontrada.");

    // Validate parameters
    const colCount = input.colEnd - input.colStart + 1;
    if (colCount > 500) throw new Error("La cantidad de columnas supera el máximo permitido (500)");

    let rowCount: number;
    const generatedCodes: string[] = [];

    if (input.rowMode === "LETTER") {
      const startCode = input.rowStart.charCodeAt(0);
      const endCode = input.rowEnd.charCodeAt(0);
      if (startCode > endCode) throw new Error("rowStart debe ser menor o igual a rowEnd");
      rowCount = endCode - startCode + 1;
      if (rowCount > 26) throw new Error("El modo de fila LETRA soporta máximo 26 filas (A-Z)");

      for (let i = startCode; i <= endCode; i++) {
        const letter = String.fromCharCode(i);
        for (let col = input.colStart; col <= input.colEnd; col++) {
          generatedCodes.push(`${letter}${input.separator}${col}`);
        }
      }
    } else {
      // FIXED mode: use rowStart/rowEnd as fixed text row labels
      const rows = generateFixedRows(input.rowStart, input.rowEnd);
      rowCount = rows.length;
      for (const row of rows) {
        for (let col = input.colStart; col <= input.colEnd; col++) {
          generatedCodes.push(`${row}${input.separator}${col}`);
        }
      }
    }

    // Validate total codes
    const totalCodes = generatedCodes.length;
    if (totalCodes > 2000) throw new Error("El total de códigos superaría el máximo permitido (2000)");

    // Query existing codes
    const existing = await prismaClient.storageLocation.findMany({
      where: {
        branchId: branch.id,
        code: { in: generatedCodes }
      },
      select: { code: true }
    });

    const existingCodes = new Set(existing.map((loc) => loc.code));
    const newCodes = generatedCodes.filter((code) => !existingCodes.has(code));

    // Generate sample: first 10 + last 5 (if different)
    const sampleSize = 15;
    const sample = [];
    if (totalCodes <= sampleSize) {
      sample.push(...newCodes);
    } else {
      sample.push(...newCodes.slice(0, 10));
      sample.push(...newCodes.slice(-5));
    }

    return {
      totalToGenerate: totalCodes,
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
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new Error("Sucursal no encontrada.");

    const user = await prismaClient.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    // Validate parameters
    const colCount = input.colEnd - input.colStart + 1;
    if (colCount > 500) throw new Error("La cantidad de columnas supera el máximo permitido (500)");

    const generatedCodes: { code: string; description: string | undefined }[] = [];

    if (input.rowMode === "LETTER") {
      const startCode = input.rowStart.charCodeAt(0);
      const endCode = input.rowEnd.charCodeAt(0);
      if (startCode > endCode) throw new Error("rowStart debe ser menor o igual a rowEnd");
      const rowCount = endCode - startCode + 1;
      if (rowCount > 26) throw new Error("El modo de fila LETRA soporta máximo 26 filas (A-Z)");

      for (let i = startCode; i <= endCode; i++) {
        const letter = String.fromCharCode(i);
        for (let col = input.colStart; col <= input.colEnd; col++) {
          const code = `${letter}${input.separator}${col}`;
          const description = input.descriptionTemplate
            ? input.descriptionTemplate.replace("{row}", letter).replace("{col}", String(col))
            : undefined;
          generatedCodes.push({ code, description });
        }
      }
    } else {
      const rows = generateFixedRows(input.rowStart, input.rowEnd);
      for (const row of rows) {
        for (let col = input.colStart; col <= input.colEnd; col++) {
          const code = `${row}${input.separator}${col}`;
          const description = input.descriptionTemplate
            ? input.descriptionTemplate.replace("{row}", row).replace("{col}", String(col))
            : undefined;
          generatedCodes.push({ code, description });
        }
      }
    }

    if (generatedCodes.length > 2000) throw new Error("El total de códigos superaría el máximo permitido (2000)");

    // Filter out existing codes
    const allCodes = generatedCodes.map((g) => g.code);
    const existing = await prismaClient.storageLocation.findMany({
      where: { branchId: branch.id, code: { in: allCodes } },
      select: { code: true }
    });
    const existingCodes = new Set(existing.map((loc) => loc.code));
    const toCreate = generatedCodes.filter((g) => !existingCodes.has(g.code));

    // Bulk insert using createMany
    await prismaClient.storageLocation.createMany({
      data: toCreate.map((g) => ({
        branchId: branch.id,
        code: g.code,
        description: g.description ?? null,
        createdBy: user.id
      }))
    });

    // Single audit log for the batch
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
      total: generatedCodes.length
    };
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function parseScrapStatus(value?: string): ScrapStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  const allowed: ScrapStatus[] = [
    ScrapStatus.PENDING_CLASSIFICATION,
    ScrapStatus.DISCARDED,
    ScrapStatus.PENDING_STORAGE,
    ScrapStatus.STORED,
    ScrapStatus.USED
  ];
  return allowed.includes(normalized as ScrapStatus) ? (normalized as ScrapStatus) : undefined;
}

function generateFixedRows(rowStart: string, rowEnd: string): string[] {
  // For FIXED mode, parse rowStart and rowEnd as comma-separated values
  // If they contain commas, split them; otherwise treat as simple strings
  if (rowStart.includes(",") || rowEnd.includes(",")) {
    const rows = [];
    const startRows = rowStart.split(",").map((r) => r.trim());
    const endRows = rowEnd.split(",").map((r) => r.trim());
    rows.push(...startRows);
    // If rowEnd is different from rowStart, add endRows (avoid duplicates)
    if (rowEnd !== rowStart) {
      rows.push(...endRows);
    }
    return [...new Set(rows)];
  }
  // Single row case: just use rowStart
  return [rowStart];
}
