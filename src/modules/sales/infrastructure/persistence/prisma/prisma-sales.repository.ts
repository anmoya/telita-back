import { AuditAction, CutJobStatus, DiscountSource, PriceMethod, SaleStatus, ScrapStatus } from "@prisma/client";
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
    customerId?: string;
    customerName?: string;
    customerReference?: string;
    manualDiscountPct?: number;
    manualDiscountReason?: string;
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

    const customer = input.customerId
      ? await prismaClient.customer.findFirst({
          where: { id: input.customerId, branchId: branch.id, isActive: true }
        })
      : null;
    if (input.customerId && !customer) throw new Error("Cliente no encontrado.");
    const discount = resolveSaleDiscount({
      manualDiscountPct: input.manualDiscountPct,
      customerDiscountCode: customer?.discountCode ?? null,
      customerDiscountPct: customer ? Number(customer.discountPct) : 0
    });

    const sale = await prismaClient.sale.create({
      data: {
        branchId: branch.id,
        createdBy: createdBy.id,
        quoteNumber,
        customerId: customer?.id ?? null,
        customerName: customer?.fullName ?? input.customerName,
        customerReference: customer?.companyOrReference ?? input.customerReference,
        status: SaleStatus.DRAFT,
        priceListId: priceList.id,
        currencyCode: priceList.currencyCode,
        manualDiscountPct: normalizeDiscount(input.manualDiscountPct),
        manualDiscountReason: input.manualDiscountReason?.trim() || null,
        discountSource: discount.source,
        discountCodeApplied: discount.code,
        discountPctApplied: discount.pct,
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
    roomAreaName?: string;
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

    const cell = await prismaClient.priceListCell.findFirst({
      where: {
        priceListId: sale.priceListId,
        skuId: sku.id,
        maxWidthM: { gte: input.requestedWidthM },
        maxHeightM: { gte: input.requestedHeightM }
      },
      orderBy: [{ maxWidthM: "asc" }, { maxHeightM: "asc" }]
    });
    const priceMethod = cell ? PriceMethod.TABLE_LOOKUP : PriceMethod.LINEAR_METER;
    const unitPrice = cell ? Number(cell.unitPrice) : Number(priceItem.basePrice);
    const amounts = computeLineAmounts({
      priceMethod,
      requestedHeightM: input.requestedHeightM,
      quantity: input.quantity,
      unitPrice,
      discountPct: Number(sale.discountPctApplied)
    });

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
        roomAreaName: input.roomAreaName ?? input.categoryName ?? null,
        requestedWidthM: input.requestedWidthM,
        requestedHeightM: input.requestedHeightM,
        quantity: input.quantity,
        priceMethod,
        unitPrice,
        discountPct: Number(sale.discountPctApplied),
        lineSubtotal: amounts.lineSubtotal,
        lineTotal: amounts.lineTotal
      }
    });
    await this.createSaleLinePieces(line.id, {
      quantity: input.quantity,
      requestedWidthM: input.requestedWidthM,
      requestedHeightM: input.requestedHeightM,
      roomAreaName: input.roomAreaName ?? input.categoryName ?? null
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
        lineTotal: amounts.lineTotal,
        categoryId: resolvedCategoryId,
        displayOrder: input.displayOrder ?? 0,
        roomAreaName: input.roomAreaName ?? input.categoryName ?? null
      }
    });

    await this.recomputeTotals(sale.id);
  }

  async updateCustomer(
    saleId: string,
    updatedByEmail: string,
    input: {
      customerId?: string | null;
      customerName?: string | null;
      customerReference?: string | null;
      manualDiscountPct?: number | null;
      manualDiscountReason?: string | null;
    }
  ) {
    const sale = await prismaClient.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.status !== "DRAFT") throw new Error("Solo se puede editar el cliente en ventas en estado DRAFT.");
    const user = await prismaClient.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");
    const customer =
      input.customerId === undefined
        ? sale.customerId
          ? await prismaClient.customer.findUnique({ where: { id: sale.customerId } })
          : null
        : input.customerId
          ? await prismaClient.customer.findFirst({
              where: { id: input.customerId, branchId: sale.branchId, isActive: true }
            })
          : null;
    if (input.customerId && !customer) throw new Error("Cliente no encontrado.");
    const manualDiscountPct =
      input.manualDiscountPct === undefined || input.manualDiscountPct === null
        ? Number(sale.manualDiscountPct)
        : input.manualDiscountPct;
    const discount = resolveSaleDiscount({
      manualDiscountPct,
      customerDiscountCode: customer?.discountCode ?? null,
      customerDiscountPct: customer ? Number(customer.discountPct) : 0
    });
    await prismaClient.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: saleId },
        data: {
          customerId: input.customerId === undefined ? sale.customerId : customer?.id ?? null,
          customerName: customer?.fullName ?? input.customerName ?? sale.customerName,
          customerReference: customer?.companyOrReference ?? input.customerReference ?? sale.customerReference,
          manualDiscountPct: normalizeDiscount(manualDiscountPct),
          manualDiscountReason:
            input.manualDiscountReason === undefined ? sale.manualDiscountReason : input.manualDiscountReason?.trim() || null,
          discountSource: discount.source,
          discountCodeApplied: discount.code,
          discountPctApplied: discount.pct
        }
      });
      await this.refreshLineDiscounts(tx, saleId, discount.pct);
      await this.recomputeTotals(saleId, tx);
    });
    await this.auditRepo.log({
      branchId: sale.branchId,
      actorUserId: user.id,
      entityType: "sale",
      entityId: sale.id,
      action: AuditAction.UPDATE,
      beforeJson: {
        customerId: sale.customerId,
        customerName: sale.customerName,
        customerReference: sale.customerReference,
        manualDiscountPct: Number(sale.manualDiscountPct),
        discountSource: sale.discountSource,
        discountCodeApplied: sale.discountCodeApplied,
        discountPctApplied: Number(sale.discountPctApplied)
      },
      afterJson: {
        customerId: customer?.id ?? null,
        customerName: customer?.fullName ?? input.customerName ?? sale.customerName,
        customerReference: customer?.companyOrReference ?? input.customerReference ?? sale.customerReference,
        manualDiscountPct: normalizeDiscount(manualDiscountPct),
        discountSource: discount.source,
        discountCodeApplied: discount.code,
        discountPctApplied: discount.pct
      }
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

  async recomputeTotals(saleId: string, tx: MinimalSalesTx = prismaClient) {
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (!sale) return;
    const lines = await tx.saleLine.findMany({ where: { saleId } });
    const subtotal = round2(lines.reduce((acc, line) => acc + Number(line.lineTotal), 0));
    const tax = round2(subtotal * 0.19);
    const total = roundClpCash(subtotal + tax);
    const balanceDue = Math.max(total - Number(sale.amountPaid), 0);

    await tx.sale.update({
      where: { id: saleId },
      data: { subtotalAmount: subtotal, taxAmount: tax, totalAmount: total, balanceDue }
    });
  }

  async confirm(saleId: string) {
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
    
    if (!sale.customerId) {
      throw new Error("Debe seleccionar un cliente del maestro para confirmar la venta.");
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
    customerId?: string;
    customerName?: string;
    customerReference?: string;
    manualDiscountPct?: number;
    manualDiscountReason?: string;
    items: Array<{
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
      roomAreaName?: string;
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
    const customer = input.customerId
      ? await prismaClient.customer.findFirst({
          where: { id: input.customerId, branchId: branch.id, isActive: true }
        })
      : null;
    if (input.customerId && !customer) throw new Error("Cliente no encontrado.");
    const discount = resolveSaleDiscount({
      manualDiscountPct: input.manualDiscountPct,
      customerDiscountCode: customer?.discountCode ?? null,
      customerDiscountPct: customer ? Number(customer.discountPct) : 0
    });

    // Validate and compute all line data before opening the transaction
    type LineData = {
      skuId: string;
      categoryId: string | null;
      displayOrder: number;
      lineNote: string | null;
      roomAreaName: string | null;
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
        const discountPct = discount.pct;
        const amounts = computeLineAmounts({
          priceMethod,
          requestedHeightM: item.requestedHeightM,
          quantity: item.quantity,
          unitPrice,
          discountPct
        });

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
          roomAreaName: item.roomAreaName ?? item.categoryName ?? null,
          requestedWidthM: item.requestedWidthM,
          requestedHeightM: item.requestedHeightM,
          quantity: item.quantity,
          priceMethod,
          unitPrice,
          discountPct,
          lineSubtotal: amounts.lineSubtotal,
          lineTotal: amounts.lineTotal
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
          customerId: customer?.id ?? null,
          customerName: customer?.fullName ?? input.customerName,
          customerReference: customer?.companyOrReference ?? input.customerReference,
          status: SaleStatus.DRAFT,
          priceListId: priceList.id,
          currencyCode: priceList.currencyCode,
          manualDiscountPct: normalizeDiscount(input.manualDiscountPct),
          manualDiscountReason: input.manualDiscountReason?.trim() || null,
          discountSource: discount.source,
          discountCodeApplied: discount.code,
          discountPctApplied: discount.pct,
          subtotalAmount,
          taxAmount,
          totalAmount
        }
      });

      for (const ld of lineDataList) {
        const createdLine = await tx.saleLine.create({
          data: {
            saleId: newSale.id,
            skuId: ld.skuId,
            categoryId: ld.categoryId,
            displayOrder: ld.displayOrder,
            lineNote: ld.lineNote,
            roomAreaName: ld.roomAreaName,
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
        await createSaleLinePiecesTx(tx, createdLine.id, {
          quantity: ld.quantity,
          requestedWidthM: ld.requestedWidthM,
          requestedHeightM: ld.requestedHeightM,
          roomAreaName: ld.roomAreaName
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
        customer: { select: { id: true, code: true, fullName: true, phone: true, email: true, companyOrReference: true, discountCode: true } },
        lines: {
          include: {
            sku: { select: { code: true } },
            category: { select: { name: true } },
            allocations: { where: { isActive: true }, select: { scrapId: true } },
            pieces: { orderBy: { pieceIndex: "asc" } }
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
            pieces: { orderBy: { pieceIndex: "asc" } },
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

  private async createSaleLinePieces(
    saleLineId: string,
    input: { quantity: number; requestedWidthM: number; requestedHeightM: number; roomAreaName: string | null }
  ) {
    await createSaleLinePiecesTx(prismaClient, saleLineId, input);
  }

  private async refreshLineDiscounts(tx: MinimalSalesTx, saleId: string, discountPct: number) {
    const lines = await tx.saleLine.findMany({ where: { saleId } });
    for (const line of lines) {
      const amounts = computeLineAmounts({
        priceMethod: line.priceMethod,
        requestedHeightM: Number(line.requestedHeightM),
        quantity: line.quantity,
        unitPrice: Number(line.unitPrice),
        discountPct
      });
      await tx.saleLine.update({
        where: { id: line.id },
        data: {
          discountPct,
          lineSubtotal: amounts.lineSubtotal,
          lineTotal: amounts.lineTotal
        }
      });
    }
  }
}

async function createSaleLinePiecesTx(
  tx: MinimalSalesTx,
  saleLineId: string,
  input: { quantity: number; requestedWidthM: number; requestedHeightM: number; roomAreaName: string | null }
) {
  if (input.quantity <= 0) return;
  const data = Array.from({ length: input.quantity }, (_, index) => ({
    saleLineId,
    pieceIndex: index + 1,
    pieceTotal: input.quantity,
    requestedWidthM: input.requestedWidthM,
    requestedHeightM: input.requestedHeightM,
    roomAreaName: input.roomAreaName
  }));
  await tx.saleLinePiece.createMany({ data });
}

function computeLineAmounts(input: {
  priceMethod: PriceMethod;
  requestedHeightM: number;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}) {
  const grossSubtotal =
    input.priceMethod === PriceMethod.TABLE_LOOKUP
      ? round2(input.unitPrice * input.quantity)
      : round2(input.requestedHeightM * input.quantity * input.unitPrice);
  const lineTotal = round2(grossSubtotal * (1 - input.discountPct / 100));
  return {
    lineSubtotal: grossSubtotal,
    lineTotal
  };
}

function resolveSaleDiscount(input: {
  manualDiscountPct?: number | null;
  customerDiscountCode?: string | null;
  customerDiscountPct?: number;
}) {
  const manualDiscountPct = normalizeDiscount(input.manualDiscountPct);
  if (manualDiscountPct > 0) {
    return { source: DiscountSource.MANUAL, code: null, pct: manualDiscountPct };
  }
  const customerDiscountPct = normalizeDiscount(input.customerDiscountPct);
  if (customerDiscountPct > 0 && input.customerDiscountCode) {
    return {
      source: DiscountSource.CUSTOMER_CODE,
      code: input.customerDiscountCode,
      pct: customerDiscountPct
    };
  }
  return { source: DiscountSource.NONE, code: null, pct: 0 };
}

function normalizeDiscount(value?: number | null) {
  const discount = Number(value ?? 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    throw new Error("El descuento debe estar entre 0 y 100.");
  }
  return round2(discount);
}

type MinimalSalesTx = Pick<
  typeof prismaClient,
  "sale" | "saleLine" | "saleLinePiece"
>;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function roundClpCash(value: number): number {
  const integer = Math.round(value);
  const remainder = integer % 10;
  const base = integer - remainder;
  return remainder <= 5 ? base : base + 10;
}
