import { Injectable } from "@nestjs/common";
import { AuditAction, PriceMethod, Prisma, PrismaClient, QuoteBatchStatus } from "@prisma/client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaQuoteItemCategoriesRepository } from "../../../../quote-item-categories/infrastructure/persistence/prisma/prisma-quote-item-categories.repository";

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
  roomAreaName?: string;
  displayOrder?: number;
};

@Injectable()
export class PrismaQuoteBatchesRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository,
    private readonly categoriesRepo: PrismaQuoteItemCategoriesRepository
  ) {}

  async create(input: {
    branchCode: string;
    createdByEmail: string;
    priceListName: string;
    customerId?: string;
    customerName?: string;
    customerReference?: string;
    amountPaid?: number;
    commercialAdjustmentPct?: number;
    installationAmount?: number;
    lines: LineInput[];
  }) {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    const user = await this.prisma.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !user) throw new Error("Sucursal o usuario no encontrado.");

    const priceList = await this.prisma.priceList.findFirst({
      where: { branchId: branch.id, name: input.priceListName, isActive: true }
    });
    if (!priceList) throw new Error("Lista de precios no encontrada.");

    const resolvedLines = await this.resolveLines(input.lines, branch.id, user.email);
    const commercialAdjPct = Math.min(Math.max(input.commercialAdjustmentPct ?? 0, 0), 100);
    const baseSubtotal = round2(resolvedLines.map(l => l.lineSubtotal).reduce((a, b) => a + b, 0));
    const commercialAdj = round2(baseSubtotal * (commercialAdjPct / 100));
    const installation = Math.max(input.installationAmount ?? 0, 0);
    const { subtotal, tax, total } = computeTotals(resolvedLines.map(l => l.lineSubtotal), commercialAdj, installation);

    const amountPaid = Math.max(input.amountPaid ?? 0, 0);
    if (amountPaid > total) throw new Error("El abono no puede superar el total.");

    const batch = await this.prisma.$transaction(async (tx) => {
      const quoteNumber = await getNextDocumentNumberTx(tx, branch.id);

      const newBatch = await tx.quoteBatch.create({
        data: {
          branchId: branch.id,
          createdBy: user.id,
          quoteNumber,
          priceListId: priceList.id,
          customerId: input.customerId ?? null,
          customerName: input.customerName,
          customerReference: input.customerReference,
          commercialAdjustmentPct: commercialAdjPct,
          commercialAdjustmentAmount: commercialAdj,
          installationAmount: installation,
          subtotalAmount: subtotal,
          taxAmount: tax,
          totalAmount: total,
          amountPaid,
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
            roomAreaName: line.roomAreaName?.trim() || null,
            displayOrder: line.displayOrder
          }
        });
      }
      return newBatch;
    });

    await this.auditRepo.log({
      branchId: branch.id,
      actorUserId: user.id,
      entityType: "quote_batch",
      entityId: batch.id,
      action: AuditAction.CREATE,
      afterJson: { status: batch.status, linesCount: resolvedLines.length, totalAmount: total, quoteNumber: batch.quoteNumber }
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
      this.prisma.quoteBatch.findMany({
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
      this.prisma.quoteBatch.count({ where })
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
    return this.prisma.quoteBatch.findUnique({
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
    customerId?: string | null;
    customerName?: string;
    customerReference?: string;
    amountPaid?: number;
    commercialAdjustmentPct?: number;
    installationAmount?: number;
    lines?: LineInput[];
  }) {
    const batch = await this.prisma.quoteBatch.findUnique({ where: { id } });
    if (!batch) throw new Error("Cotización no encontrada.");
    if (batch.status !== QuoteBatchStatus.DRAFT) throw new Error("Solo se pueden editar cotizaciones en estado DRAFT.");

    const user = await this.prisma.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const updateData: Record<string, unknown> = {};
    if (input.customerId !== undefined) updateData.customerId = input.customerId;
    if (input.customerName !== undefined) updateData.customerName = input.customerName;
    if (input.customerReference !== undefined) updateData.customerReference = input.customerReference;
    if (input.amountPaid !== undefined) updateData.amountPaid = Math.max(input.amountPaid, 0);
    if (input.commercialAdjustmentPct !== undefined) updateData.commercialAdjustmentPct = Math.min(Math.max(input.commercialAdjustmentPct, 0), 100);
    if (input.installationAmount !== undefined) updateData.installationAmount = Math.max(input.installationAmount, 0);

    if (input.lines) {
      const resolvedLines = await this.resolveLines(input.lines, batch.branchId, updatedByEmail);
      const adjPct = input.commercialAdjustmentPct !== undefined ? Math.min(Math.max(input.commercialAdjustmentPct, 0), 100) : Number(batch.commercialAdjustmentPct);
      const linesBase = round2(resolvedLines.map(l => l.lineSubtotal).reduce((a, b) => a + b, 0));
      const commercialAdj = round2(linesBase * (adjPct / 100));
      updateData.commercialAdjustmentAmount = commercialAdj;
      const installation = input.installationAmount !== undefined ? Math.max(input.installationAmount, 0) : Number(batch.installationAmount);
      const { subtotal, tax, total } = computeTotals(resolvedLines.map(l => l.lineSubtotal), commercialAdj, installation);
      updateData.subtotalAmount = subtotal;
      updateData.taxAmount = tax;
      updateData.totalAmount = total;

      await this.prisma.$transaction(async (tx) => {
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
              roomAreaName: line.roomAreaName?.trim() || null,
              displayOrder: line.displayOrder
            }
          });
        }
        await tx.quoteBatch.update({ where: { id }, data: updateData });
      });
    } else {
      await this.prisma.quoteBatch.update({ where: { id }, data: updateData });
    }

    await this.auditRepo.log({
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

    const user = await this.prisma.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const newBatch = await this.prisma.$transaction(async (tx) => {
      const quoteNumber = await getNextDocumentNumberTx(tx, original.branchId);

      const copy = await tx.quoteBatch.create({
        data: {
          branchId: original.branchId,
          createdBy: user.id,
          quoteNumber,
          priceListId: original.priceListId,
          customerId: original.customerId,
          customerName: original.customerName,
          customerReference: original.customerReference,
          commercialAdjustmentPct: original.commercialAdjustmentPct,
          commercialAdjustmentAmount: original.commercialAdjustmentAmount,
          installationAmount: original.installationAmount,
          subtotalAmount: original.subtotalAmount,
          taxAmount: original.taxAmount,
          totalAmount: original.totalAmount,
          amountPaid: original.amountPaid,
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
            roomAreaName: line.roomAreaName ?? null,
            displayOrder: line.displayOrder
          }
        });
      }
      return copy;
    });

    await this.auditRepo.log({
      branchId: original.branchId,
      actorUserId: user.id,
      entityType: "quote_batch",
      entityId: newBatch.id,
      action: AuditAction.CREATE,
      afterJson: { duplicatedFrom: id, status: newBatch.status, quoteNumber: newBatch.quoteNumber }
    });

    return newBatch;
  }

  async finalize(id: string, updatedByEmail: string) {
    const batch = await this.prisma.quoteBatch.findUnique({ where: { id } });
    if (!batch) throw new Error("Cotización no encontrada.");
    if (batch.status !== QuoteBatchStatus.DRAFT) throw new Error("Solo se pueden finalizar cotizaciones en estado DRAFT.");

    const user = await this.prisma.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    await this.prisma.quoteBatch.update({ where: { id }, data: { status: QuoteBatchStatus.FINALIZED } });

    await this.auditRepo.log({
      branchId: batch.branchId,
      actorUserId: user.id,
      entityType: "quote_batch",
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: QuoteBatchStatus.DRAFT },
      afterJson: { status: QuoteBatchStatus.FINALIZED }
    });
  }

  async cancel(id: string, updatedByEmail: string) {
    const batch = await this.prisma.quoteBatch.findUnique({ where: { id } });
    if (!batch) throw new Error("Cotización no encontrada.");
    if (batch.status !== QuoteBatchStatus.DRAFT) throw new Error("Solo se pueden anular cotizaciones en estado DRAFT.");

    const user = await this.prisma.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    await this.prisma.quoteBatch.update({ where: { id }, data: { status: QuoteBatchStatus.CANCELED } });

    await this.auditRepo.log({
      branchId: batch.branchId,
      actorUserId: user.id,
      entityType: "quote_batch",
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: QuoteBatchStatus.DRAFT },
      afterJson: { status: QuoteBatchStatus.CANCELED }
    });
  }

  private async resolveLines(lines: LineInput[], branchId: string, createdByEmail: string) {
    type Resolved = LineInput & { skuId: string; categoryId: string | null; displayOrder: number };
    const result: Resolved[] = [];

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const sku = await this.prisma.fabricSku.findFirst({
        where: { branchId, code: l.skuCode, isActive: true }
      });
      if (!sku) throw new Error(`SKU no encontrado: ${l.skuCode}`);

      let resolvedCategoryId: string | null = null;
      if (l.categoryId) {
        resolvedCategoryId = l.categoryId;
      } else if (l.categoryName) {
        const cat = await this.categoriesRepo.findOrCreate({ branchId, name: l.categoryName, createdByEmail });
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

async function getNextDocumentNumberTx(
  tx: Prisma.TransactionClient,
  branchId: string
) {
  const [lastBatch, lastSale] = await Promise.all([
    tx.quoteBatch.findFirst({
      where: { branchId },
      orderBy: { quoteNumber: "desc" },
      select: { quoteNumber: true }
    }),
    tx.sale.findFirst({
      where: { branchId },
      orderBy: { quoteNumber: "desc" },
      select: { quoteNumber: true }
    })
  ]);

  return Math.max(lastBatch?.quoteNumber ?? 0, lastSale?.quoteNumber ?? 0) + 1;
}

function computeTotals(lineSubtotals: number[], commercialAdj = 0, installation = 0) {
  const baseSubtotal = round2(lineSubtotals.reduce((a, b) => a + b, 0));
  const taxableSubtotal = round2(baseSubtotal + commercialAdj + installation);
  const tax = round2(taxableSubtotal * 0.19);
  const total = roundClp(taxableSubtotal + tax);
  return { subtotal: taxableSubtotal, tax, total };
}

function round2(v: number) { return Number(v.toFixed(2)); }

function roundClp(v: number) {
  const int = Math.round(v);
  const rem = int % 10;
  return rem <= 5 ? int - rem : int - rem + 10;
}
