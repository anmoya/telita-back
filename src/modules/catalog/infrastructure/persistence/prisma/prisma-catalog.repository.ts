import { Injectable } from "@nestjs/common";
import { AuditAction, PrismaClient } from "@prisma/client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

export type CreateSkuInput = {
  branchCode: string;
  code: string;
  name: string;
  description?: string;
  lengthValue: number;
  lengthUnitCode: string;
  widthValue: number;
  widthUnitCode: string;
  thicknessValue: number;
  thicknessUnitCode: string;
  weightValue: number;
  weightUnitCode: string;
};

export type UpdateSkuInput = {
  name?: string;
  description?: string;
  lengthValue?: number;
  lengthUnitCode?: string;
  widthValue?: number;
  widthUnitCode?: string;
  thicknessValue?: number;
  thicknessUnitCode?: string;
  weightValue?: number;
  weightUnitCode?: string;
};

type SkuDto = {
  id: string;
  code: string;
  name: string;
  description?: string;
  lengthValue: number;
  lengthUnitCode: string;
  widthValue: number;
  widthUnitCode: string;
  thicknessValue: number;
  thicknessUnitCode: string;
  weightValue: number;
  weightUnitCode: string;
  isActive: boolean;
};

@Injectable()
export class PrismaCatalogRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async listSkus(branchCode: string) {
    return this.prisma.fabricSku.findMany({
      where: {
        branch: { code: branchCode },
        isActive: true
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        widthValue: true,
        lengthValue: true,
        thicknessValue: true,
        weightValue: true
      },
      orderBy: { name: "asc" }
    });
  }

  async listAllSkus(branchCode: string): Promise<SkuDto[]> {
    const skus = await this.prisma.fabricSku.findMany({
      where: {
        branch: { code: branchCode }
      },
      include: {
        lengthUnit: { select: { code: true } },
        widthUnit: { select: { code: true } },
        thicknessUnit: { select: { code: true } },
        weightUnit: { select: { code: true } }
      },
      orderBy: { name: "asc" }
    });

    return skus.map((sku) => ({
      id: sku.id,
      code: sku.code,
      name: sku.name,
      description: sku.description ?? undefined,
      lengthValue: Number(sku.lengthValue),
      lengthUnitCode: sku.lengthUnit.code,
      widthValue: Number(sku.widthValue),
      widthUnitCode: sku.widthUnit.code,
      thicknessValue: Number(sku.thicknessValue),
      thicknessUnitCode: sku.thicknessUnit.code,
      weightValue: Number(sku.weightValue),
      weightUnitCode: sku.weightUnit.code,
      isActive: sku.isActive
    }));
  }

  async listUnits() {
    const [lengths, weights] = await Promise.all([
      this.prisma.unitLength.findMany({ orderBy: { name: "asc" } }),
      this.prisma.unitWeight.findMany({ orderBy: { name: "asc" } })
    ]);

    return {
      lengths: lengths.map((u) => ({ id: u.id, code: u.code, name: u.name })),
      weights: weights.map((u) => ({ id: u.id, code: u.code, name: u.name }))
    };
  }

  async createSku(input: CreateSkuInput, actorId: string): Promise<SkuDto> {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new Error(`Sucursal no encontrada: ${input.branchCode}`);

    const existingCode = await this.prisma.fabricSku.findUnique({
      where: { branchId_code: { branchId: branch.id, code: input.code } }
    });
    if (existingCode) throw new Error(`Código SKU ya existe en esta sucursal: ${input.code}`);

    const [lengthUnit, widthUnit, thicknessUnit, weightUnit] = await Promise.all([
      this.prisma.unitLength.findUnique({ where: { code: input.lengthUnitCode } }),
      this.prisma.unitLength.findUnique({ where: { code: input.widthUnitCode } }),
      this.prisma.unitLength.findUnique({ where: { code: input.thicknessUnitCode } }),
      this.prisma.unitWeight.findUnique({ where: { code: input.weightUnitCode } })
    ]);

    if (!lengthUnit) throw new Error(`Unidad de largo no encontrada: ${input.lengthUnitCode}`);
    if (!widthUnit) throw new Error(`Unidad de ancho no encontrada: ${input.widthUnitCode}`);
    if (!thicknessUnit) throw new Error(`Unidad de espesor no encontrada: ${input.thicknessUnitCode}`);
    if (!weightUnit) throw new Error(`Unidad de peso no encontrada: ${input.weightUnitCode}`);

    const sku = await this.prisma.fabricSku.create({
      data: {
        branchId: branch.id,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        lengthValue: input.lengthValue,
        lengthUnitId: lengthUnit.id,
        widthValue: input.widthValue,
        widthUnitId: widthUnit.id,
        thicknessValue: input.thicknessValue,
        thicknessUnitId: thicknessUnit.id,
        weightValue: input.weightValue,
        weightUnitId: weightUnit.id,
        isActive: true
      },
      include: {
        lengthUnit: { select: { code: true } },
        widthUnit: { select: { code: true } },
        thicknessUnit: { select: { code: true } },
        weightUnit: { select: { code: true } }
      }
    });

    await this.auditRepo.log({
      branchId: branch.id,
      actorUserId: actorId,
      entityType: "fabric_sku",
      entityId: sku.id,
      action: AuditAction.CREATE,
      afterJson: { code: sku.code, name: sku.name, branchCode: input.branchCode }
    });

    return {
      id: sku.id,
      code: sku.code,
      name: sku.name,
      description: sku.description ?? undefined,
      lengthValue: Number(sku.lengthValue),
      lengthUnitCode: sku.lengthUnit.code,
      widthValue: Number(sku.widthValue),
      widthUnitCode: sku.widthUnit.code,
      thicknessValue: Number(sku.thicknessValue),
      thicknessUnitCode: sku.thicknessUnit.code,
      weightValue: Number(sku.weightValue),
      weightUnitCode: sku.weightUnit.code,
      isActive: true
    };
  }

  async updateSku(id: string, input: UpdateSkuInput, actorId: string): Promise<SkuDto> {
    const existing = await this.prisma.fabricSku.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, code: true } },
        lengthUnit: { select: { id: true, code: true } },
        widthUnit: { select: { id: true, code: true } },
        thicknessUnit: { select: { id: true, code: true } },
        weightUnit: { select: { id: true, code: true } },
        saleLines: { select: { id: true } }
      }
    });

    if (!existing) throw new Error("SKU no encontrado.");

    const hasHistory = existing.saleLines.length > 0;

    let updateData: any = {
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description
    };

    if (hasHistory) {
      if (
        input.lengthValue !== undefined ||
        input.lengthUnitCode ||
        input.widthValue !== undefined ||
        input.widthUnitCode ||
        input.thicknessValue !== undefined ||
        input.thicknessUnitCode ||
        input.weightValue !== undefined ||
        input.weightUnitCode
      ) {
        throw new Error("No se pueden cambiar medidas de SKU con ventas asociadas.");
      }
    } else {
      if (input.lengthValue !== undefined || input.lengthUnitCode) {
        const lengthUnit = input.lengthUnitCode
          ? await this.prisma.unitLength.findUnique({ where: { code: input.lengthUnitCode }, select: { id: true } })
          : existing.lengthUnit;
        if (input.lengthUnitCode && !lengthUnit) throw new Error(`Unidad de largo no encontrada: ${input.lengthUnitCode}`);
        updateData.lengthValue = input.lengthValue ?? existing.lengthValue;
        updateData.lengthUnitId = lengthUnit!.id;
      }
      if (input.widthValue !== undefined || input.widthUnitCode) {
        const widthUnit = input.widthUnitCode
          ? await this.prisma.unitLength.findUnique({ where: { code: input.widthUnitCode }, select: { id: true } })
          : existing.widthUnit;
        if (input.widthUnitCode && !widthUnit) throw new Error(`Unidad de ancho no encontrada: ${input.widthUnitCode}`);
        updateData.widthValue = input.widthValue ?? existing.widthValue;
        updateData.widthUnitId = widthUnit!.id;
      }
      if (input.thicknessValue !== undefined || input.thicknessUnitCode) {
        const thicknessUnit = input.thicknessUnitCode
          ? await this.prisma.unitLength.findUnique({ where: { code: input.thicknessUnitCode }, select: { id: true } })
          : existing.thicknessUnit;
        if (input.thicknessUnitCode && !thicknessUnit)
          throw new Error(`Unidad de espesor no encontrada: ${input.thicknessUnitCode}`);
        updateData.thicknessValue = input.thicknessValue ?? existing.thicknessValue;
        updateData.thicknessUnitId = thicknessUnit!.id;
      }
      if (input.weightValue !== undefined || input.weightUnitCode) {
        const weightUnit = input.weightUnitCode
          ? await this.prisma.unitWeight.findUnique({ where: { code: input.weightUnitCode }, select: { id: true } })
          : existing.weightUnit;
        if (input.weightUnitCode && !weightUnit) throw new Error(`Unidad de peso no encontrada: ${input.weightUnitCode}`);
        updateData.weightValue = input.weightValue ?? existing.weightValue;
        updateData.weightUnitId = weightUnit!.id;
      }
    }

    const sku = await this.prisma.fabricSku.update({
      where: { id },
      data: updateData,
      include: {
        lengthUnit: { select: { code: true } },
        widthUnit: { select: { code: true } },
        thicknessUnit: { select: { code: true } },
        weightUnit: { select: { code: true } }
      }
    });

    await this.auditRepo.log({
      branchId: existing.branch.id,
      actorUserId: actorId,
      entityType: "fabric_sku",
      entityId: id,
      action: AuditAction.UPDATE,
      beforeJson: { name: existing.name, description: existing.description },
      afterJson: { name: sku.name, description: sku.description }
    });

    return {
      id: sku.id,
      code: sku.code,
      name: sku.name,
      description: sku.description ?? undefined,
      lengthValue: Number(sku.lengthValue),
      lengthUnitCode: sku.lengthUnit.code,
      widthValue: Number(sku.widthValue),
      widthUnitCode: sku.widthUnit.code,
      thicknessValue: Number(sku.thicknessValue),
      thicknessUnitCode: sku.thicknessUnit.code,
      weightValue: Number(sku.weightValue),
      weightUnitCode: sku.weightUnit.code,
      isActive: sku.isActive
    };
  }

  async setSkuStatus(id: string, isActive: boolean, actorId: string): Promise<SkuDto> {
    const existing = await this.prisma.fabricSku.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true } },
        lengthUnit: { select: { code: true } },
        widthUnit: { select: { code: true } },
        thicknessUnit: { select: { code: true } },
        weightUnit: { select: { code: true } }
      }
    });

    if (!existing) throw new Error("SKU no encontrado.");

    const sku = await this.prisma.fabricSku.update({
      where: { id },
      data: { isActive },
      include: {
        lengthUnit: { select: { code: true } },
        widthUnit: { select: { code: true } },
        thicknessUnit: { select: { code: true } },
        weightUnit: { select: { code: true } }
      }
    });

    await this.auditRepo.log({
      branchId: existing.branch.id,
      actorUserId: actorId,
      entityType: "fabric_sku",
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { isActive: existing.isActive },
      afterJson: { isActive: sku.isActive }
    });

    return {
      id: sku.id,
      code: sku.code,
      name: sku.name,
      description: sku.description ?? undefined,
      lengthValue: Number(sku.lengthValue),
      lengthUnitCode: sku.lengthUnit.code,
      widthValue: Number(sku.widthValue),
      widthUnitCode: sku.widthUnit.code,
      thicknessValue: Number(sku.thicknessValue),
      thicknessUnitCode: sku.thicknessUnit.code,
      weightValue: Number(sku.weightValue),
      weightUnitCode: sku.weightUnit.code,
      isActive: sku.isActive
    };
  }
}
