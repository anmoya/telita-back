import { AuditAction, CutJobStatus, PriceMethod, SaleStatus, ScrapStatus } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaQuoteItemCategoriesRepository } from "../../../../quote-item-categories/infrastructure/persistence/prisma/prisma-quote-item-categories.repository";

export class PrismaSalesRepository {
  private readonly auditRepo = new PrismaAuditRepository();
  private readonly categoriesRepo = new PrismaQuoteItemCategoriesRepository();

  async createDraft(input: {
    branchCode: string;
    createdByEmail: string;
    priceListName: string;
    customerName?: string;
    customerReference?: string;
  }) {
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    const createdBy = await prismaClient.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !createdBy) throw new Error("Sucursal o usuario no encontrado.");

    const priceList = await prismaClient.priceList.findFirst({
      where: { branchId: branch.id, name: input.priceListName, isActive: true }
    });
    if (!priceList) throw new Error("Lista de precios no encontrada.");

    // Get next quote number for this branch using a transaction
    const quoteNumber = await prismaClient.$transaction(async (tx) => {
      const lastSale = await tx.sale.findFirst({
        where: { branchId: branch.id },
        orderBy: { quoteNumber: "desc" },
        select: { quoteNumber: true }
      });
      return (lastSale?.quoteNumber ?? 0) + 1;
    });

    const sale = await prismaClient.sale.create({
      data: {
        branchId: branch.id,
        createdBy: createdBy.id,
        quoteNumber,
        customerName: input.customerName,
        customerReference: input.customerReference,
        status: SaleStatus.DRAFT,
        priceListId: priceList.id,
        currencyCode: priceList.currencyCode,
        subtotalAmount: 0,
        taxAmount: 0,
        totalAmount: 0
      }
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: createdBy.id,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.CREATE,
      afterJson: { status: sale.status, priceListId: sale.priceListId, quoteNumber: sale.quoteNumber }
    });

    return sale;
  }

  async addLine(saleId: string, input: {
    skuCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    quantity: number;
    categoryId?: string;
    categoryName?: string;
    displayOrder?: number;
    lineNote?: string;
    createdByEmail?: string;
  }) {
    const sale = await prismaClient.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.status !== SaleStatus.DRAFT) throw new Error("Solo se pueden agregar líneas a ventas en estado DRAFT.");

    const sku = await prismaClient.fabricSku.findFirst({
      where: { branchId: sale.branchId, code: input.skuCode, isActive: true }
    });
    if (!sku) throw new Error("SKU no encontrado.");

    const skuWidthM = Number(sku.widthValue);
    if (input.requestedWidthM > skuWidthM) throw new Error("El ancho solicitado supera el ancho del SKU.");

    const priceItem = await prismaClient.priceListItem.findFirst({
      where: { priceListId: sale.priceListId, skuId: sku.id }
    });
    if (!priceItem) throw new Error("Precio no encontrado para el SKU.");

    const unitPrice = Number(priceItem.basePrice);
    const linearMeters = input.requestedHeightM * input.quantity;
    const lineSubtotal = round2(linearMeters * unitPrice);
    const lineTotal = lineSubtotal;

    // Resolve category: prefer explicit categoryId, fallback to categoryName (create if needed)
    let resolvedCategoryId: string | null = null;
    if (input.categoryId) {
      resolvedCategoryId = input.categoryId;
    } else if (input.categoryName && input.createdByEmail) {
      const category = await this.categoriesRepo.findOrCreate({
        branchId: sale.branchId,
        name: input.categoryName,
        createdByEmail: input.createdByEmail
      });
      resolvedCategoryId = category.id;
    }

    const line = await prismaClient.saleLine.create({
      data: {
        saleId: sale.id,
        skuId: sku.id,
        categoryId: resolvedCategoryId,
        displayOrder: input.displayOrder ?? 0,
        lineNote: input.lineNote ?? null,
        requestedWidthM: input.requestedWidthM,
        requestedHeightM: input.requestedHeightM,
        quantity: input.quantity,
        priceMethod: PriceMethod.LINEAR_METER,
        unitPrice,
        discountPct: 0,
        lineSubtotal,
        lineTotal
      }
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: sale.createdBy,
      entityType: "sale_line",
      entityId: line.id,
      action: AuditAction.CREATE,
      afterJson: {
        saleId: sale.id,
        skuId: sku.id,
        quantity: input.quantity,
        lineTotal,
        categoryId: resolvedCategoryId,
        displayOrder: input.displayOrder ?? 0
      }
    });

    await this.recomputeTotals(sale.id);
  }

  async updateCustomer(saleId: string, updatedByEmail: string, input: { customerName?: string | null; customerReference?: string | null }) {
    const sale = await prismaClient.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.status !== "DRAFT") throw new Error("Solo se puede editar el cliente en ventas en estado DRAFT.");
    const user = await prismaClient.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");
    await prismaClient.sale.update({
      where: { id: saleId },
      data: { customerName: input.customerName, customerReference: input.customerReference }
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: user.id,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.UPDATE,
      beforeJson: { customerName: sale.customerName, customerReference: sale.customerReference },
      afterJson: { customerName: input.customerName, customerReference: input.customerReference }
    });
  }

  async updatePaymentSummary(saleId: string, amountPaid: number) {
    const sale = await prismaClient.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Venta no encontrada.");
    const balanceDue = Math.max(Number(sale.totalAmount) - amountPaid, 0);
    await prismaClient.sale.update({
      where: { id: saleId },
      data: { amountPaid, balanceDue }
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: sale.createdBy,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.UPDATE,
      beforeJson: { amountPaid: Number(sale.amountPaid) },
      afterJson: { amountPaid, balanceDue }
    });
  }

  async recomputeTotals(saleId: string) {
    const sale = await prismaClient.sale.findUnique({ where: { id: saleId } });
    if (!sale) return;
    const lines = await prismaClient.saleLine.findMany({ where: { saleId } });
    const subtotal = round2(lines.reduce((acc, line) => acc + Number(line.lineTotal), 0));
    const tax = round2(subtotal * 0.19);
    const total = roundClpCash(subtotal + tax);
    const balanceDue = Math.max(total - Number(sale.amountPaid), 0);

    await prismaClient.sale.update({
      where: { id: saleId },
      data: { subtotalAmount: subtotal, taxAmount: tax, totalAmount: total, balanceDue }
    });
  }

  async confirm(saleId: string, rules?: { scrapRequiredAtStage?: string }) {
    const sale = await prismaClient.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: {
          include: { allocations: { where: { isActive: true }, select: { id: true, scrapId: true } } }
        }
      }
    });
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.status !== SaleStatus.DRAFT) throw new Error("Solo se puede confirmar una venta en estado DRAFT.");
    if (sale.lines.length === 0) throw new Error("No se puede confirmar una venta sin líneas.");
    
    // Validate customer_name is required for confirmation
    if (!sale.customerName || sale.customerName.trim() === "") {
      throw new Error("El nombre del cliente es obligatorio para confirmar la venta.");
    }

    if (rules?.scrapRequiredAtStage === "AT_SALE_CLOSE") {
      const lineIds = sale.lines.map((l) => l.id);
      const pendingScrap = await prismaClient.scrap.findFirst({
        where: { saleLineId: { in: lineIds }, status: ScrapStatus.PENDING_STORAGE }
      });
      if (pendingScrap) {
        throw new Error("Existen retazos pendientes de almacenamiento. Asigne ubicacion antes de confirmar la venta.");
      }
    }

    await prismaClient.$transaction(async (tx) => {
      await tx.sale.update({ where: { id: sale.id }, data: { status: SaleStatus.CONFIRMED } });
      for (const line of sale.lines) {
        const allocation = line.allocations[0];
        if (allocation) {
          await tx.scrap.update({ where: { id: allocation.scrapId }, data: { status: ScrapStatus.USED } });
        } else {
          const exists = await tx.cutJob.findFirst({ where: { saleLineId: line.id } });
          if (!exists) {
            await tx.cutJob.create({ data: { saleLineId: line.id, status: "PENDING" } });
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
    const sale = await prismaClient.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: {
          include: { allocations: { where: { isActive: true }, select: { id: true, scrapId: true } } }
        }
      }
    });
    if (!sale) throw new Error("Venta no encontrada.");

    const lineIds = sale.lines.map((line) => line.id);
    if (lineIds.length > 0) {
      const blocked = await prismaClient.cutJob.findFirst({
        where: { saleLineId: { in: lineIds }, status: { in: ["CUT", "DELIVERED"] } }
      });
      if (blocked) throw new Error("No se puede anular la venta porque el corte ya fue ejecutado.");
    }

    await prismaClient.$transaction(async (tx) => {
      for (const line of sale.lines) {
        const allocation = line.allocations[0];
        if (allocation) {
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

  async createFromQuote(input: {
    branchCode: string;
    createdByEmail: string;
    priceListName: string;
    customerName?: string;
    customerReference?: string;
    items: Array<{
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
      categoryId?: string;
      categoryName?: string;
      displayOrder?: number;
      lineNote?: string;
    }>;
  }) {
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    const createdByUser = await prismaClient.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!branch || !createdByUser) throw new Error("Sucursal o usuario no encontrado.");

    const priceList = await prismaClient.priceList.findFirst({
      where: { branchId: branch.id, name: input.priceListName, isActive: true }
    });
    if (!priceList) throw new Error("Lista de precios no encontrada.");

    // Validate and compute all line data before opening the transaction
    type LineData = {
      skuId: string;
      categoryId: string | null;
      displayOrder: number;
      lineNote: string | null;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
      priceMethod: PriceMethod;
      unitPrice: number;
      discountPct: number;
      lineSubtotal: number;
      lineTotal: number;
    };
    const lineErrors: Array<{ index: number; error: string }> = [];
    const lineDataList: LineData[] = [];

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      try {
        const sku = await prismaClient.fabricSku.findFirst({
          where: { branchId: branch.id, code: item.skuCode, isActive: true }
        });
        if (!sku) throw new Error(`SKU no encontrado: ${item.skuCode}`);

        const skuWidthM = Number(sku.widthValue);
        if (item.requestedWidthM > skuWidthM) throw new Error("El ancho solicitado supera el ancho del SKU.");

        const priceItem = await prismaClient.priceListItem.findFirst({
          where: { priceListId: priceList.id, skuId: sku.id }
        });
        if (!priceItem) throw new Error(`Precio no encontrado para el SKU: ${item.skuCode}`);

        // Check for dimensional cell pricing
        const cell = await prismaClient.priceListCell.findFirst({
          where: {
            priceListId: priceList.id,
            skuId: sku.id,
            maxWidthM: { gte: item.requestedWidthM },
            maxHeightM: { gte: item.requestedHeightM }
          },
          orderBy: [{ maxWidthM: "asc" }, { maxHeightM: "asc" }]
        });

        const priceMethod = cell ? PriceMethod.TABLE_LOOKUP : PriceMethod.LINEAR_METER;
        const unitPrice = cell ? Number(cell.unitPrice) : Number(priceItem.basePrice);
        const discountPct = Number(priceItem.discountPct ?? 0);
        const linearMeters = item.requestedHeightM * item.quantity;
        const lineSubtotal = round2(linearMeters * unitPrice * (1 - discountPct / 100));
        const lineTotal = lineSubtotal;

        // Resolve category
        let resolvedCategoryId: string | null = null;
        if (item.categoryId) {
          resolvedCategoryId = item.categoryId;
        } else if (item.categoryName) {
          const category = await this.categoriesRepo.findOrCreate({
            branchId: branch.id,
            name: item.categoryName,
            createdByEmail: input.createdByEmail
          });
          resolvedCategoryId = category.id;
        }

        lineDataList.push({
          skuId: sku.id,
          categoryId: resolvedCategoryId,
          displayOrder: item.displayOrder ?? i,
          lineNote: item.lineNote ?? null,
          requestedWidthM: item.requestedWidthM,
          requestedHeightM: item.requestedHeightM,
          quantity: item.quantity,
          priceMethod,
          unitPrice,
          discountPct,
          lineSubtotal,
          lineTotal
        });
      } catch (err) {
        lineErrors.push({ index: i, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    if (lineErrors.length > 0) {
      throw Object.assign(new Error("Some items are invalid"), { lineErrors, isValidationError: true });
    }

    // Compute totals
    const subtotalAmount = round2(lineDataList.reduce((acc, l) => acc + l.lineTotal, 0));
    const taxAmount = round2(subtotalAmount * 0.19);
    const totalAmount = roundClpCash(subtotalAmount + taxAmount);

    // Atomic creation
    const sale = await prismaClient.$transaction(async (tx) => {
      const lastSale = await tx.sale.findFirst({
        where: { branchId: branch.id },
        orderBy: { quoteNumber: "desc" },
        select: { quoteNumber: true }
      });
      const quoteNumber = (lastSale?.quoteNumber ?? 0) + 1;

      const newSale = await tx.sale.create({
        data: {
          branchId: branch.id,
          createdBy: createdByUser.id,
          quoteNumber,
          customerName: input.customerName,
          customerReference: input.customerReference,
          status: SaleStatus.DRAFT,
          priceListId: priceList.id,
          currencyCode: priceList.currencyCode,
          subtotalAmount,
          taxAmount,
          totalAmount
        }
      });

      for (const ld of lineDataList) {
        await tx.saleLine.create({
          data: {
            saleId: newSale.id,
            skuId: ld.skuId,
            categoryId: ld.categoryId,
            displayOrder: ld.displayOrder,
            lineNote: ld.lineNote,
            requestedWidthM: ld.requestedWidthM,
            requestedHeightM: ld.requestedHeightM,
            quantity: ld.quantity,
            priceMethod: ld.priceMethod,
            unitPrice: ld.unitPrice,
            discountPct: ld.discountPct,
            lineSubtotal: ld.lineSubtotal,
            lineTotal: ld.lineTotal
          }
        });
      }

      return newSale;
    });

    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: createdByUser.id,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.CREATE,
      afterJson: {
        status: sale.status,
        priceListId: sale.priceListId,
        quoteNumber: sale.quoteNumber,
        linesCreated: lineDataList.length,
        totalAmount
      }
    });

    return { sale, linesCreated: lineDataList.length, subtotalAmount, taxAmount, totalAmount };
  }

  async list(branchCode: string) {
    return prismaClient.sale.findMany({
      where: { branch: { code: branchCode } },
      include: {
        lines: {
          include: {
            sku: { select: { code: true } },
            category: { select: { name: true } },
            allocations: { where: { isActive: true }, select: { scrapId: true } }
          },
          orderBy: { displayOrder: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async markCut(cutJobId: string, cutByEmail: string) {
    const user = await prismaClient.appUser.findUnique({ where: { email: cutByEmail } });
    if (!user) throw new Error("Operador de corte no encontrado.");

    const current = await prismaClient.cutJob.findUnique({ where: { id: cutJobId } });
    if (!current) throw new Error("Trabajo de corte no encontrado.");
    if (current.status !== CutJobStatus.PENDING && current.status !== CutJobStatus.IN_PROGRESS) {
      throw new Error("El trabajo de corte no puede marcarse como CORTADO desde el estado actual.");
    }

    const cutJob = await prismaClient.cutJob.update({
      where: { id: cutJobId },
      data: {
        status: CutJobStatus.CUT,
        cutBy: user.id,
        cutAt: new Date()
      },
      include: {
        saleLine: {
          include: {
            sku: { include: { widthUnit: true, lengthUnit: true } },
            sale: { select: { branchId: true } }
          }
        }
      }
    });
    await this.auditRepo.log({
      actorUserId: user.id,
      entityType: "cut_job",
      entityId: cutJob.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: "PENDING|IN_PROGRESS" },
      afterJson: { status: "CUT", cutAt: cutJob.cutAt?.toISOString() ?? null }
    });
    return cutJob;
  }

  async listCutJobs(params: { saleId?: string; branchCode?: string; status?: CutJobStatus }) {
    return prismaClient.cutJob.findMany({
      where: {
        status: params.status,
        saleLine: {
          saleId: params.saleId,
          sale: params.branchCode ? { branch: { code: params.branchCode } } : undefined
        }
      },
      include: {
        saleLine: {
          include: {
            sku: { select: { code: true, name: true } },
            sale: { select: { id: true, createdAt: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function roundClpCash(value: number): number {
  const integer = Math.round(value);
  const remainder = integer % 10;
  const base = integer - remainder;
  return remainder <= 5 ? base : base + 10;
}
