import { AuditAction, PriceMethod, Prisma, QuoteBatchStatus } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaQuoteItemCategoriesRepository } from "../../../../quote-item-categories/infrastructure/persistence/prisma/prisma-quote-item-categories.repository";

const auditRepo = new PrismaAuditRepository();
const categoriesRepo = new PrismaQuoteItemCategoriesRepository();

type LineInput = {
  skuCode: string;
  requestedWidthM: number;
  requestedHeightM: number;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  priceMethod: PriceMethod;
  categoryId?: string | null;
  categoryName?: string;
  lineNote?: string;
  displayOrder?: number;
};

export class PrismaQuoteBatchesRepository {
  async create(input: {
    branchCode: string;
    createdByEmail: string;
    priceListName: string;
    customerName?: string;
    customerReference?: string;
    lines: LineInput[];
  }) {
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    const user = await prismaClient.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !user) throw new Error("Sucursal o usuario no encontrado.");

    const priceList = await prismaClient.priceList.findFirst({
      where: { branchId: branch.id, name: input.priceListName, isActive: true }
    });
    if (!priceList) throw new Error("Lista de precios no encontrada.");

    const resolvedLines = await this.resolveLines(input.lines, branch.id, user.email);
    const { subtotal, tax, total } = computeTotals(resolvedLines.map(l => l.lineSubtotal));

    const batch = await prismaClient.$transaction(async (tx) => {
      const newBatch = await tx.quoteBatch.create({
        data: {
          branchId: branch.id,
          createdBy: user.id,
          priceListId: priceList.id,
          customerName: input.customerName,
          customerReference: input.customerReference,
          subtotalAmount: subtotal,
          taxAmount: tax,
          totalAmount: total,
          status: QuoteBatchStatus.DRAFT
        }
      });
      for (const line of resolvedLines) {
        await tx.quoteBatchLine.create({
          data: {
            quoteBatchId: newBatch.id,
            skuId: line.skuId,
            requestedWidthM: line.requestedWidthM,
            requestedHeightM: line.requestedHeightM,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineSubtotal: line.lineSubtotal,
            priceMethod: line.priceMethod,
            categoryId: line.categoryId ?? null,
            lineNote: line.lineNote ?? null,
            displayOrder: line.displayOrder
          }
        });
      }
      return newBatch;
    });

    await auditRepo.log({
      branchId: branch.id,
      actorUserId: user.id,
      entityType: "quote_batch",
      entityId: batch.id,
      action: AuditAction.CREATE,
      afterJson: { status: batch.status, linesCount: resolvedLines.length, totalAmount: total }
    });

    return batch;
  }

  async list(
    branchCode: string,
    filters?: {
      status?: QuoteBatchStatus;
      customerName?: string;
      customerReference?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const limit = Math.min(filters?.limit ?? 8, 100);
    const page = Math.max(filters?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const createdAtFilter: Record<string, Date> | undefined =
      filters?.from || filters?.to
        ? {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {})
          }
        : undefined;

    const where: Prisma.QuoteBatchWhereInput = {
      branch: { code: branchCode },
      status: filters?.status,
      customerName: filters?.customerName ? { contains: filters.customerName, mode: Prisma.QueryMode.insensitive } : undefined,
      customerReference: filters?.customerReference ? { contains: filters.customerReference, mode: Prisma.QueryMode.insensitive } : undefined,
      createdAt: createdAtFilter
    };

    const [data, total] = await Promise.all([
      prismaClient.quoteBatch.findMany({
        where,
        include: {
          createdByUser: { select: { email: true, fullName: true } },
          priceList: { select: { name: true, currencyCode: true } },
          lines: {
            include: {
              sku: { select: { code: true, name: true } },
              category: { select: { name: true } }
            },
            orderBy: { displayOrder: "asc" }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prismaClient.quoteBatch.count({ where })
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findById(id: string) {
    return prismaClient.quoteBatch.findUnique({
      where: { id },
      include: {
        createdByUser: { select: { email: true, fullName: true } },
        priceList: { select: { name: true, currencyCode: true } },
        lines: {
          include: {
            sku: { select: { code: true, name: true } },
            category: { select: { name: true } }
          },
          orderBy: { displayOrder: "asc" }
        }
      }
    });
  }

  async update(id: string, updatedByEmail: string, input: {
    customerName?: string;
    customerReference?: string;
    lines?: LineInput[];
  }) {
    const batch = await prismaClient.quoteBatch.findUnique({ where: { id } });
    if (!batch) throw new Error("Cotización no encontrada.");
    if (batch.status !== QuoteBatchStatus.DRAFT) throw new Error("Solo se pueden editar cotizaciones en estado DRAFT.");

    const user = await prismaClient.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const updateData: Record<string, unknown> = {};
    if (input.customerName !== undefined) updateData.customerName = input.customerName;
    if (input.customerReference !== undefined) updateData.customerReference = input.customerReference;

    if (input.lines) {
      const resolvedLines = await this.resolveLines(input.lines, batch.branchId, updatedByEmail);
      const { subtotal, tax, total } = computeTotals(resolvedLines.map(l => l.lineSubtotal));
      updateData.subtotalAmount = subtotal;
      updateData.taxAmount = tax;
      updateData.totalAmount = total;

      await prismaClient.$transaction(async (tx) => {
        await tx.quoteBatchLine.deleteMany({ where: { quoteBatchId: id } });
        for (const line of resolvedLines) {
          await tx.quoteBatchLine.create({
            data: {
              quoteBatchId: id,
              skuId: line.skuId,
              requestedWidthM: line.requestedWidthM,
              requestedHeightM: line.requestedHeightM,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineSubtotal: line.lineSubtotal,
              priceMethod: line.priceMethod,
              categoryId: line.categoryId ?? null,
              lineNote: line.lineNote ?? null,
              displayOrder: line.displayOrder
            }
          });
        }
        await tx.quoteBatch.update({ where: { id }, data: updateData });
      });
    } else {
      await prismaClient.quoteBatch.update({ where: { id }, data: updateData });
    }

    await auditRepo.log({
      branchId: batch.branchId,
      actorUserId: user.id,
      entityType: "quote_batch",
      entityId: id,
      action: AuditAction.UPDATE,
      afterJson: { ...updateData }
    });
  }

  async duplicate(id: string, createdByEmail: string) {
    const original = await this.findById(id);
    if (!original) throw new Error("Cotización no encontrada.");

    const user = await prismaClient.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const newBatch = await prismaClient.$transaction(async (tx) => {
      const copy = await tx.quoteBatch.create({
        data: {
          branchId: original.branchId,
          createdBy: user.id,
          priceListId: original.priceListId,
          customerName: original.customerName,
          customerReference: original.customerReference,
          subtotalAmount: original.subtotalAmount,
          taxAmount: original.taxAmount,
          totalAmount: original.totalAmount,
          status: QuoteBatchStatus.DRAFT
        }
      });
      for (const line of original.lines) {
        await tx.quoteBatchLine.create({
          data: {
            quoteBatchId: copy.id,
            skuId: line.skuId,
            requestedWidthM: line.requestedWidthM,
            requestedHeightM: line.requestedHeightM,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineSubtotal: line.lineSubtotal,
            priceMethod: line.priceMethod,
            categoryId: line.categoryId ?? null,
            lineNote: line.lineNote ?? null,
            displayOrder: line.displayOrder
          }
        });
      }
      return copy;
    });

    await auditRepo.log({
      branchId: original.branchId,
      actorUserId: user.id,
      entityType: "quote_batch",
      entityId: newBatch.id,
      action: AuditAction.CREATE,
      afterJson: { duplicatedFrom: id, status: newBatch.status }
    });

    return newBatch;
  }

  async finalize(id: string, updatedByEmail: string) {
    const batch = await prismaClient.quoteBatch.findUnique({ where: { id } });
    if (!batch) throw new Error("Cotización no encontrada.");
    if (batch.status !== QuoteBatchStatus.DRAFT) throw new Error("Solo se pueden finalizar cotizaciones en estado DRAFT.");

    const user = await prismaClient.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    await prismaClient.quoteBatch.update({ where: { id }, data: { status: QuoteBatchStatus.FINALIZED } });

    await auditRepo.log({
      branchId: batch.branchId,
      actorUserId: user.id,
      entityType: "quote_batch",
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: QuoteBatchStatus.DRAFT },
      afterJson: { status: QuoteBatchStatus.FINALIZED }
    });
  }

  private async resolveLines(lines: LineInput[], branchId: string, createdByEmail: string) {
    type Resolved = LineInput & { skuId: string; categoryId: string | null; displayOrder: number };
    const result: Resolved[] = [];

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const sku = await prismaClient.fabricSku.findFirst({
        where: { branchId, code: l.skuCode, isActive: true }
      });
      if (!sku) throw new Error(`SKU no encontrado: ${l.skuCode}`);

      let resolvedCategoryId: string | null = null;
      if (l.categoryId) {
        resolvedCategoryId = l.categoryId;
      } else if (l.categoryName) {
        const cat = await categoriesRepo.findOrCreate({ branchId, name: l.categoryName, createdByEmail });
        resolvedCategoryId = cat.id;
      }

      result.push({
        ...l,
        skuId: sku.id,
        categoryId: resolvedCategoryId,
        displayOrder: l.displayOrder ?? i
      });
    }
    return result;
  }
}

function computeTotals(lineSubtotals: number[]) {
  const subtotal = round2(lineSubtotals.reduce((a, b) => a + b, 0));
  const tax = round2(subtotal * 0.19);
  const total = roundClp(subtotal + tax);
  return { subtotal, tax, total };
}

function round2(v: number) { return Number(v.toFixed(2)); }

function roundClp(v: number) {
  const int = Math.round(v);
  const rem = int % 10;
  return rem <= 5 ? int - rem : int - rem + 10;
}
