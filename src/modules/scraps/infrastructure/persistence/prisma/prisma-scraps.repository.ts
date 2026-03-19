import { Injectable } from "@nestjs/common";
import { AuditAction, ScrapStatus, SoftHoldStatus } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaSettingsRepository } from "../../../../settings/infrastructure/persistence/prisma/prisma-settings.repository";
import { evaluateScrapRule, type ScrapLocationPolicy, type ScrapRuleContext } from "../../../domain/scrap-policy";

@Injectable()
export class PrismaScrapsRepository {
  private readonly auditRepo = new PrismaAuditRepository();
  private readonly settingsRepo = new PrismaSettingsRepository();

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
    const scrapWidthM = Math.max(skuWidthM - Number(quote.requestedWidthM), 0);
    const scrapHeightM = Math.max(Number(quote.requestedHeightM), 0);
    const areaM2 = round3(scrapWidthM * scrapHeightM);
    const policy = await this.settingsRepo.getScrapPolicy();
    const context = buildScrapRuleContext({
      scrapWidthM,
      scrapHeightM,
      skuWidthM,
      skuLengthM: Number(quote.sku.lengthValue) * Number(quote.sku.lengthUnit.toMeterFactor),
      skuThicknessM: 0
    });
    const isUseful = scrapWidthM > 0 && scrapHeightM > 0 && evaluateScrapRule(policy.classificationRule, context);
    const status = isUseful ? ScrapStatus.PENDING_INBOUND : ScrapStatus.DISCARDED;

    const scrap = await prismaClient.scrap.create({
      data: {
        branchId: quote.branchId,
        skuId: quote.skuId,
        quoteId: quote.id,
        widthM: scrapWidthM,
        heightM: scrapHeightM,
        areaM2,
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
        areaM2: Number(scrap.areaM2),
        isUseful
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
    // Lazy expiration: expire stale holds before matching
    await this.expireStaleHolds();

    const scraps = await prismaClient.scrap.findMany({
      where: {
        status: ScrapStatus.STORED,
        branch: { code: params.branchCode },
        sku: { code: params.skuCode },
        widthM: { gte: params.requestedWidthM },
        heightM: { gte: params.requestedHeightM },
        allocations: { none: { isActive: true } },
        softHolds: { none: { status: SoftHoldStatus.ACTIVE } }
      },
      include: { sku: true, location: true },
      take: params.limit ?? 10
    });

    const requestedArea = params.requestedWidthM * params.requestedHeightM;
    return scraps
      .map((s) => ({ ...s, excessAreaM2: Number(s.areaM2) - requestedArea }))
      .sort((a, b) => a.excessAreaM2 - b.excessAreaM2);
  }

  async matchForCutJob(params: {
    cutJobId: string;
    scope: "CURRENT_LINE" | "ENTIRE_ORDER";
    maxPerLine: number;
  }) {
    const cutJob = await prismaClient.cutJob.findUnique({
      where: { id: params.cutJobId },
      include: {
        saleLine: {
          include: {
            sku: true,
            sale: {
              include: {
                branch: true,
                lines: { include: { sku: true } }
              }
            }
          }
        }
      }
    });
    if (!cutJob) throw new Error("Trabajo de corte no encontrado.");

    const sale = cutJob.saleLine.sale;
    const branchCode = sale.branch.code;

    const linesToCheck = params.scope === "ENTIRE_ORDER"
      ? sale.lines
      : [cutJob.saleLine];

    const results: Array<{
      saleLineId: string;
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      suggestions: Array<{
        scrapId: string;
        locationCode: string | null;
        widthM: number;
        heightM: number;
        fitScore: number;
      }>;
    }> = [];

    for (const line of linesToCheck) {
      const matches = await this.match({
        branchCode,
        skuCode: line.sku.code,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        limit: params.maxPerLine
      });

      results.push({
        saleLineId: line.id,
        skuCode: line.sku.code,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        suggestions: matches.map((m) => ({
          scrapId: m.id,
          locationCode: m.location?.code ?? null,
          widthM: Number(m.widthM),
          heightM: Number(m.heightM),
          fitScore: Number(m.excessAreaM2.toFixed(3))
        }))
      });
    }

    return {
      saleId: sale.id,
      cutJobId: cutJob.id,
      lines: results
    };
  }

  async matchForSaleLines(params: {
    saleId: string;
    lineIds?: string[];
    limitPerLine: number;
  }) {
    await this.expireStaleHolds();

    const sale = await prismaClient.sale.findUnique({
      where: { id: params.saleId },
      include: {
        branch: true,
        lines: {
          include: {
            sku: true,
            pieces: {
              include: {
                allocations: { where: { isActive: true }, select: { id: true } }
              }
            }
          },
          orderBy: { displayOrder: "asc" }
        }
      }
    });
    if (!sale) throw new Error("Venta no encontrada.");

    const linesToCheck = params.lineIds
      ? sale.lines.filter((l) => params.lineIds!.includes(l.id))
      : sale.lines;

    const eligibleLines = linesToCheck.filter((line) => line.pieces.some((piece) => piece.allocations.length === 0));

    const results: Array<{
      saleLineId: string;
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      suggestions: Array<{
        scrapId: string;
        labelCode: string;
        locationCode: string | null;
        widthM: number;
        heightM: number;
        areaM2: number;
        excessAreaM2: number;
        createdAt: string;
      }>;
    }> = [];

    for (const line of eligibleLines) {
      const matches = await this.match({
        branchCode: sale.branch.code,
        skuCode: line.sku.code,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        limit: params.limitPerLine
      });

      const labels = await prismaClient.label.findMany({
        where: { scrapId: { in: matches.map((m) => m.id) } },
        select: { scrapId: true, id: true }
      });
      const labelMap = new Map(labels.map((l) => [l.scrapId, l.id.slice(0, 8)]));

      results.push({
        saleLineId: line.id,
        skuCode: line.sku.code,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        suggestions: matches.map((m) => ({
          scrapId: m.id,
          labelCode: labelMap.get(m.id) ?? m.id.slice(0, 8),
          locationCode: m.location?.code ?? null,
          widthM: Number(m.widthM),
          heightM: Number(m.heightM),
          areaM2: Number(m.areaM2),
          excessAreaM2: Number(m.excessAreaM2.toFixed(3)),
          createdAt: m.createdAt.toISOString()
        }))
      });
    }

    return { saleId: sale.id, lines: results };
  }

  async matchForSaleLine(params: { saleId: string; saleLineId: string; limit?: number }) {
    await this.expireStaleHolds();

    const line = await prismaClient.saleLine.findFirst({
      where: { id: params.saleLineId, saleId: params.saleId },
      include: {
        sku: true,
        sale: { include: { branch: true } },
        pieces: {
          include: {
            allocations: { where: { isActive: true }, select: { id: true } }
          },
          orderBy: { pieceIndex: "asc" }
        }
      }
    });
    if (!line) throw new Error("Línea de venta no encontrada.");

    const freePieces = line.pieces.filter((piece) => piece.allocations.length === 0);
    const matches = freePieces.length > 0
      ? await this.match({
          branchCode: line.sale.branch.code,
          skuCode: line.sku.code,
          requestedWidthM: Number(line.requestedWidthM),
          requestedHeightM: Number(line.requestedHeightM),
          limit: params.limit ?? 5
        })
      : [];

    const labels = await prismaClient.label.findMany({
      where: { scrapId: { in: matches.map((match) => match.id) } },
      select: { scrapId: true, id: true }
    });
    const labelMap = new Map(labels.map((label) => [label.scrapId, label.id.slice(0, 8)]));

    return {
      saleId: params.saleId,
      saleLineId: line.id,
      skuCode: line.sku.code,
      requestedWidthM: Number(line.requestedWidthM),
      requestedHeightM: Number(line.requestedHeightM),
      freePieces: freePieces.map((piece) => ({
        id: piece.id,
        pieceIndex: piece.pieceIndex,
        pieceTotal: piece.pieceTotal
      })),
      suggestions: matches.map((match) => ({
        scrapId: match.id,
        labelCode: labelMap.get(match.id) ?? match.id.slice(0, 8),
        locationCode: match.location?.code ?? null,
        widthM: Number(match.widthM),
        heightM: Number(match.heightM),
        areaM2: Number(match.areaM2),
        excessAreaM2: Number(match.excessAreaM2.toFixed(3)),
        createdAt: match.createdAt.toISOString()
      }))
    };
  }

  async allocateToSaleLine(input: { saleLineId: string; scrapId: string; allocatedByEmail: string }) {
    const line = await prismaClient.saleLine.findUnique({
      where: { id: input.saleLineId },
      include: {
        pieces: {
          include: {
            allocations: { where: { isActive: true }, select: { id: true } }
          },
          orderBy: { pieceIndex: "asc" }
        }
      }
    });
    if (!line) throw new Error("Línea de venta no encontrada.");

    const freePiece = line.pieces.find((piece) => piece.allocations.length === 0);
    if (!freePiece) throw new Error("La línea no tiene piezas libres para asignar retazos.");

    return this.allocateToSaleLinePiece({
      saleLineId: input.saleLineId,
      saleLinePieceId: freePiece.id,
      scrapId: input.scrapId,
      allocatedByEmail: input.allocatedByEmail
    });
  }

  async allocateToSaleLinePiece(input: {
    saleLineId: string;
    saleLinePieceId: string;
    scrapId: string;
    allocatedByEmail: string;
  }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.allocatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const scrap = await prismaClient.scrap.findUnique({ where: { id: input.scrapId } });
    if (!scrap) throw new Error("Retazo no encontrado.");
    if (scrap.status !== ScrapStatus.STORED) throw new Error("El retazo debe estar en estado ALMACENADO para ser asignado.");

    const existing = await prismaClient.saleLineScrapAllocation.findFirst({
      where: { scrapId: input.scrapId, isActive: true }
    });
    if (existing) throw new Error("El retazo ya tiene una asignación activa.");

    // Check soft holds: allow if held by same user, block if held by another
    const activeHold = await prismaClient.scrapSoftHold.findFirst({
      where: { scrapId: input.scrapId, status: SoftHoldStatus.ACTIVE, expiresAt: { gt: new Date() } }
    });
    if (activeHold && activeHold.heldBy !== user.id) {
      throw new Error("El retazo esta reservado temporalmente por otro usuario.");
    }

    const saleLine = await prismaClient.saleLine.findUnique({
      where: { id: input.saleLineId },
      include: {
        sale: true,
        pieces: {
          where: { id: input.saleLinePieceId },
          include: { allocations: { where: { isActive: true }, select: { id: true } } }
        }
      }
    });
    if (!saleLine) throw new Error("Línea de venta no encontrada.");
    if (saleLine.sale.status !== "DRAFT") throw new Error("Solo se puede asignar a líneas de venta en estado DRAFT.");
    const piece = saleLine.pieces[0];
    if (!piece) throw new Error("Pieza de venta no encontrada.");

    if (piece.allocations.length > 0) {
      throw new Error("La pieza de venta ya tiene una asignación activa.");
    }

    const allocation = await prismaClient.saleLineScrapAllocation.create({
      data: {
        saleLineId: input.saleLineId,
        saleLinePieceId: input.saleLinePieceId,
        scrapId: input.scrapId,
        allocatedBy: user.id,
        allocatedAt: new Date()
      }
    });

    // Convert soft hold to CONVERTED if one exists
    if (activeHold) {
      await prismaClient.scrapSoftHold.update({
        where: { id: activeHold.id },
        data: { status: SoftHoldStatus.CONVERTED, convertedAt: new Date() }
      });
      await this.auditRepo.log({
        branchId: scrap.branchId,
        actorUserId: user.id,
        entityType: "scrap_soft_hold",
        entityId: activeHold.id,
        action: AuditAction.STATUS_CHANGE,
        beforeJson: { status: "ACTIVE" },
        afterJson: { status: "CONVERTED", allocationId: allocation.id }
      });
    }

    await this.auditRepo.log({
      branchId: scrap.branchId,
      actorUserId: user.id,
      entityType: "sale_line_scrap_allocation",
      entityId: allocation.id,
      action: AuditAction.CREATE,
      afterJson: {
        saleLineId: input.saleLineId,
        saleLinePieceId: input.saleLinePieceId,
        scrapId: input.scrapId
      }
    });
    return allocation;
  }

  async releaseAllocation(input: { saleLineId: string; releasedByEmail: string }) {
    const allocation = await prismaClient.saleLineScrapAllocation.findFirst({
      where: { saleLineId: input.saleLineId, isActive: true },
      orderBy: { allocatedAt: "asc" }
    });
    if (!allocation) throw new Error("No existe una asignación activa para esta línea de venta.");

    return this.releasePieceAllocation({
      saleLineId: input.saleLineId,
      saleLinePieceId: allocation.saleLinePieceId,
      releasedByEmail: input.releasedByEmail
    });
  }

  async releasePieceAllocation(input: {
    saleLineId: string;
    saleLinePieceId: string;
    releasedByEmail: string;
  }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.releasedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const allocation = await prismaClient.saleLineScrapAllocation.findFirst({
      where: {
        saleLineId: input.saleLineId,
        saleLinePieceId: input.saleLinePieceId,
        isActive: true
      },
      include: { scrap: true }
    });
    if (!allocation) throw new Error("No existe una asignación activa para esta pieza de venta.");

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
      beforeJson: { isActive: true, saleLinePieceId: input.saleLinePieceId },
      afterJson: {
        isActive: false,
        saleLinePieceId: input.saleLinePieceId,
        releasedAt: new Date().toISOString()
      }
    });
  }

  async previewAutoAssignment(params: { saleId: string; limitPerPiece?: number }) {
    await this.expireStaleHolds();

    const sale = await prismaClient.sale.findUnique({
      where: { id: params.saleId },
      include: {
        branch: true,
        lines: {
          include: {
            sku: true,
            pieces: {
              include: {
                allocations: {
                  where: { isActive: true },
                  select: { id: true }
                }
              },
              orderBy: { pieceIndex: "asc" }
            }
          },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.status !== "DRAFT") throw new Error("La autoasignación solo está disponible para ventas DRAFT.");

    const limit = Math.max(1, Math.min(params.limitPerPiece ?? 10, 20));
    const reservedScrapIds = new Set<string>();
    const items: Array<{
      saleLineId: string;
      saleLinePieceId: string;
      pieceIndex: number;
      pieceTotal: number;
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      scrapId: string;
      labelCode: string;
      locationCode: string | null;
      widthM: number;
      heightM: number;
      areaM2: number;
      excessAreaM2: number;
    }> = [];
    const unmatchedPieces: Array<{
      saleLineId: string;
      saleLinePieceId: string;
      pieceIndex: number;
      pieceTotal: number;
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
    }> = [];

    for (const line of sale.lines) {
      for (const piece of line.pieces) {
        if (piece.allocations.length > 0) continue;

        const matches = await this.match({
          branchCode: sale.branch.code,
          skuCode: line.sku.code,
          requestedWidthM: Number(piece.requestedWidthM),
          requestedHeightM: Number(piece.requestedHeightM),
          limit
        });

        const chosen = matches.find((match) => !reservedScrapIds.has(match.id));
        if (!chosen) {
          unmatchedPieces.push({
            saleLineId: line.id,
            saleLinePieceId: piece.id,
            pieceIndex: piece.pieceIndex,
            pieceTotal: piece.pieceTotal,
            skuCode: line.sku.code,
            requestedWidthM: Number(piece.requestedWidthM),
            requestedHeightM: Number(piece.requestedHeightM)
          });
          continue;
        }

        reservedScrapIds.add(chosen.id);
        const label = await prismaClient.label.findFirst({
          where: { scrapId: chosen.id },
          select: { id: true }
        });

        items.push({
          saleLineId: line.id,
          saleLinePieceId: piece.id,
          pieceIndex: piece.pieceIndex,
          pieceTotal: piece.pieceTotal,
          skuCode: line.sku.code,
          requestedWidthM: Number(piece.requestedWidthM),
          requestedHeightM: Number(piece.requestedHeightM),
          scrapId: chosen.id,
          labelCode: label?.id.slice(0, 8) ?? chosen.id.slice(0, 8),
          locationCode: chosen.location?.code ?? null,
          widthM: Number(chosen.widthM),
          heightM: Number(chosen.heightM),
          areaM2: Number(chosen.areaM2),
          excessAreaM2: Number(chosen.excessAreaM2.toFixed(3))
        });
      }
    }

    return {
      saleId: sale.id,
      strategy: "BEST_FIT",
      items,
      unmatchedPieces,
      summary: {
        assignedPieces: items.length,
        unmatchedPieces: unmatchedPieces.length,
        totalPieces: items.length + unmatchedPieces.length
      }
    };
  }

  async commitAutoAssignment(input: {
    saleId: string;
    allocatedByEmail: string;
    items: Array<{ saleLineId: string; saleLinePieceId: string; scrapId: string }>;
  }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.allocatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");
    if (input.items.length === 0) throw new Error("No hay items para autoasignar.");

    const uniquePieceIds = new Set(input.items.map((item) => item.saleLinePieceId));
    const uniqueScrapIds = new Set(input.items.map((item) => item.scrapId));
    if (uniquePieceIds.size !== input.items.length) throw new Error("La propuesta repite piezas.");
    if (uniqueScrapIds.size !== input.items.length) throw new Error("La propuesta repite retazos.");

    const sale = await prismaClient.sale.findUnique({ where: { id: input.saleId } });
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.status !== "DRAFT") throw new Error("La autoasignación solo está disponible para ventas DRAFT.");

    const result = await prismaClient.$transaction(async (tx) => {
      const pieces = await tx.saleLinePiece.findMany({
        where: { id: { in: [...uniquePieceIds] }, saleLine: { saleId: input.saleId } },
        include: {
          saleLine: true,
          allocations: { where: { isActive: true }, select: { id: true } }
        }
      });
      if (pieces.length !== input.items.length) {
        throw new Error("La propuesta contiene piezas inválidas para esta venta.");
      }
      if (pieces.some((piece) => piece.allocations.length > 0)) {
        throw new Error("Al menos una pieza ya tiene un retazo asignado. Recalcula la autoasignación.");
      }

      const scraps = await tx.scrap.findMany({
        where: { id: { in: [...uniqueScrapIds] } }
      });
      if (scraps.length !== input.items.length) {
        throw new Error("La propuesta contiene retazos inválidos.");
      }
      if (scraps.some((scrap) => scrap.status !== ScrapStatus.STORED)) {
        throw new Error("Al menos un retazo ya no está disponible. Recalcula la autoasignación.");
      }

      const activeAllocations = await tx.saleLineScrapAllocation.findMany({
        where: { scrapId: { in: [...uniqueScrapIds] }, isActive: true },
        select: { scrapId: true }
      });
      if (activeAllocations.length > 0) {
        throw new Error("Al menos un retazo ya fue asignado por otro contexto. Recalcula la autoasignación.");
      }

      const activeHolds = await tx.scrapSoftHold.findMany({
        where: {
          scrapId: { in: [...uniqueScrapIds] },
          status: SoftHoldStatus.ACTIVE,
          expiresAt: { gt: new Date() }
        }
      });
      const foreignHold = activeHolds.find((hold) => hold.heldBy !== user.id);
      if (foreignHold) {
        throw new Error("Al menos un retazo está reservado temporalmente por otro usuario.");
      }

      const created = [];
      for (const item of input.items) {
        const allocation = await tx.saleLineScrapAllocation.create({
          data: {
            saleLineId: item.saleLineId,
            saleLinePieceId: item.saleLinePieceId,
            scrapId: item.scrapId,
            allocatedBy: user.id,
            allocatedAt: new Date()
          }
        });
        created.push(allocation);
      }

      if (activeHolds.length > 0) {
        await tx.scrapSoftHold.updateMany({
          where: { id: { in: activeHolds.map((hold) => hold.id) } },
          data: { status: SoftHoldStatus.CONVERTED, convertedAt: new Date() }
        });
      }

      return created;
    });

    for (const allocation of result) {
      await this.auditRepo.log({
        branchId: sale.branchId,
        actorUserId: user.id,
        entityType: "sale_line_scrap_allocation",
        entityId: allocation.id,
        action: AuditAction.CREATE,
        afterJson: {
          saleId: input.saleId,
          saleLineId: allocation.saleLineId,
          saleLinePieceId: allocation.saleLinePieceId,
          scrapId: allocation.scrapId,
          source: "AUTO_ASSIGNMENT"
        }
      });
    }

    return { ok: true, assignedCount: result.length };
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
    locationPolicy: ScrapLocationPolicy;
    locationCode?: string;
  }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.generatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const sku = await prismaClient.fabricSku.findUnique({
      where: { id: input.skuId },
      include: { widthUnit: true, lengthUnit: true, thicknessUnit: true }
    });
    if (!sku) throw new Error("SKU no encontrado.");

    const area = round3(input.scrapWidthM * input.scrapHeightM);
    const policy = await this.settingsRepo.getScrapPolicy();
    const context = buildScrapRuleContext({
      scrapWidthM: input.scrapWidthM,
      scrapHeightM: input.scrapHeightM,
      skuWidthM: Number(sku.widthValue) * Number(sku.widthUnit.toMeterFactor),
      skuLengthM: Number(sku.lengthValue) * Number(sku.lengthUnit.toMeterFactor),
      skuThicknessM: Number(sku.thicknessValue) * Number(sku.thicknessUnit.toMeterFactor)
    });
    const isUseful = input.scrapWidthM > 0 && input.scrapHeightM > 0 && evaluateScrapRule(policy.classificationRule, context);
    const shouldStoreNow = isUseful && input.locationPolicy === "AT_CUT_REQUIRE_LOCATION";

    let locationId: string | undefined;
    if (shouldStoreNow) {
      if (!input.locationCode) {
        throw new Error("Debe indicar una ubicacion al cerrar el corte para retazos utiles.");
      }
      const location = await prismaClient.storageLocation.findFirst({
        where: { branchId: input.branchId, code: input.locationCode, isActive: true }
      });
      if (!location) throw new Error("Ubicación no encontrada.");
      locationId = location.id;
    }

    const status = !isUseful
      ? ScrapStatus.DISCARDED
      : shouldStoreNow
        ? ScrapStatus.STORED
        : ScrapStatus.PENDING_INBOUND;

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
        locationId,
        generatedBy: user.id,
        classifiedBy: shouldStoreNow ? user.id : undefined,
        classifiedAt: shouldStoreNow ? new Date() : undefined
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
        areaM2: Number(scrap.areaM2),
        isUseful,
        locationPolicy: input.locationPolicy,
        locationId: scrap.locationId ?? null
      }
    });
    return { ...scrap, isUseful };
  }

  async list(params: { branchCode?: string; status?: string; page?: number; limit?: number }) {
    const status = parseScrapStatus(params.status);
    const limit = Math.min(params.limit ?? 8, 100);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * limit;
    const where = {
      branch: params.branchCode ? { code: params.branchCode } : undefined,
      status
    };

    const [data, total] = await Promise.all([
      prismaClient.scrap.findMany({
        where,
        include: {
          location: true,
          sku: true,
          quote: true
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prismaClient.scrap.count({ where })
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
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
    const scrapWhere = { status: { in: [ScrapStatus.PENDING_CLASSIFICATION, ScrapStatus.PENDING_STORAGE, ScrapStatus.PENDING_INBOUND, ScrapStatus.STORED] } };

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
      include: { scraps: { where: { status: { in: [ScrapStatus.PENDING_CLASSIFICATION, ScrapStatus.PENDING_STORAGE, ScrapStatus.PENDING_INBOUND, ScrapStatus.STORED] } } } }
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
      include: { scraps: { where: { status: { in: [ScrapStatus.PENDING_CLASSIFICATION, ScrapStatus.PENDING_STORAGE, ScrapStatus.PENDING_INBOUND, ScrapStatus.STORED] } } } }
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
          status: { in: [ScrapStatus.PENDING_CLASSIFICATION, ScrapStatus.PENDING_STORAGE, ScrapStatus.PENDING_INBOUND, ScrapStatus.STORED] }
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

    if (scrap.status !== ScrapStatus.PENDING_STORAGE && scrap.status !== ScrapStatus.PENDING_INBOUND) {
      throw new Error("Solo los retazos en estado pendiente pueden ser asignados.");
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

  // SPEC-58: Lazy expiration — expire stale holds
  async expireStaleHolds() {
    const now = new Date();
    const stale = await prismaClient.scrapSoftHold.findMany({
      where: { status: SoftHoldStatus.ACTIVE, expiresAt: { lte: now } }
    });
    if (stale.length === 0) return;
    await prismaClient.scrapSoftHold.updateMany({
      where: { status: SoftHoldStatus.ACTIVE, expiresAt: { lte: now } },
      data: { status: SoftHoldStatus.EXPIRED }
    });
    for (const hold of stale) {
      await this.auditRepo.log({
        branchId: hold.branchId,
        actorUserId: hold.heldBy,
        entityType: "scrap_soft_hold",
        entityId: hold.id,
        action: AuditAction.STATUS_CHANGE,
        beforeJson: { status: "ACTIVE" },
        afterJson: { status: "EXPIRED", expiredAt: now.toISOString() }
      });
    }
  }

  async createSoftHold(input: {
    scrapId: string;
    saleId: string;
    saleLineId?: string;
    heldByEmail: string;
    minutes: number;
    reason?: string;
  }) {
    await this.expireStaleHolds();

    const user = await prismaClient.appUser.findUnique({ where: { email: input.heldByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const scrap = await prismaClient.scrap.findUnique({ where: { id: input.scrapId } });
    if (!scrap) throw new Error("Retazo no encontrado.");
    if (scrap.status !== ScrapStatus.STORED) throw new Error("Solo retazos en estado ALMACENADO pueden reservarse.");

    // Check no active allocation
    const activeAlloc = await prismaClient.saleLineScrapAllocation.findFirst({
      where: { scrapId: input.scrapId, isActive: true }
    });
    if (activeAlloc) throw new Error("El retazo ya tiene una asignacion activa.");

    // Check no active soft hold
    const existingHold = await prismaClient.scrapSoftHold.findFirst({
      where: { scrapId: input.scrapId, status: SoftHoldStatus.ACTIVE }
    });
    if (existingHold) throw new Error("El retazo ya tiene una reserva activa.");

    // Validate minutes against policy
    const policy = await this.settingsRepo.getSoftHoldPolicy();
    if (!policy.enabled) throw new Error("La reserva temporal no esta habilitada.");
    const clampedMinutes = Math.max(1, Math.min(input.minutes, policy.maxMinutes));
    const expiresAt = new Date(Date.now() + clampedMinutes * 60_000);

    const hold = await prismaClient.scrapSoftHold.create({
      data: {
        branchId: scrap.branchId,
        scrapId: input.scrapId,
        saleId: input.saleId,
        saleLineId: input.saleLineId ?? null,
        heldBy: user.id,
        reason: input.reason?.trim() || null,
        expiresAt
      }
    });

    await this.auditRepo.log({
      branchId: scrap.branchId,
      actorUserId: user.id,
      entityType: "scrap_soft_hold",
      entityId: hold.id,
      action: AuditAction.CREATE,
      afterJson: {
        scrapId: input.scrapId,
        saleId: input.saleId,
        saleLineId: input.saleLineId ?? null,
        minutes: clampedMinutes,
        expiresAt: expiresAt.toISOString()
      }
    });

    return { id: hold.id, scrapId: hold.scrapId, status: hold.status, expiresAt: hold.expiresAt };
  }

  async releaseSoftHold(input: { scrapId: string; releasedByEmail: string }) {
    const user = await prismaClient.appUser.findUnique({ where: { email: input.releasedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const hold = await prismaClient.scrapSoftHold.findFirst({
      where: { scrapId: input.scrapId, status: SoftHoldStatus.ACTIVE }
    });
    if (!hold) throw new Error("No existe una reserva activa para este retazo.");

    await prismaClient.scrapSoftHold.update({
      where: { id: hold.id },
      data: { status: SoftHoldStatus.RELEASED, releasedAt: new Date() }
    });

    await this.auditRepo.log({
      branchId: hold.branchId,
      actorUserId: user.id,
      entityType: "scrap_soft_hold",
      entityId: hold.id,
      action: AuditAction.STATUS_CHANGE,
      beforeJson: { status: "ACTIVE" },
      afterJson: { status: "RELEASED", releasedAt: new Date().toISOString() }
    });
  }

  async getActiveSoftHold(scrapId: string) {
    await this.expireStaleHolds();
    return prismaClient.scrapSoftHold.findFirst({
      where: { scrapId, status: SoftHoldStatus.ACTIVE },
      include: { heldByUser: { select: { email: true, fullName: true } } }
    });
  }
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function parseScrapStatus(value?: string): ScrapStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  const allowed: ScrapStatus[] = [
    ScrapStatus.PENDING_CLASSIFICATION,
    ScrapStatus.DISCARDED,
    ScrapStatus.PENDING_STORAGE,
    ScrapStatus.PENDING_INBOUND,
    ScrapStatus.STORED,
    ScrapStatus.USED
  ];
  return allowed.includes(normalized as ScrapStatus) ? (normalized as ScrapStatus) : undefined;
}

function buildScrapRuleContext(input: {
  scrapWidthM: number;
  scrapHeightM: number;
  skuWidthM: number;
  skuLengthM: number;
  skuThicknessM: number;
}): ScrapRuleContext {
  const scrapWidthCm = round3(input.scrapWidthM * 100);
  const scrapHeightCm = round3(input.scrapHeightM * 100);
  return {
    scrap_width_cm: scrapWidthCm,
    scrap_height_cm: scrapHeightCm,
    scrap_area_cm2: round3(scrapWidthCm * scrapHeightCm),
    sku_width_cm: round3(input.skuWidthM * 100),
    sku_length_cm: round3(input.skuLengthM * 100),
    sku_thickness_cm: round3(input.skuThicknessM * 100)
  };
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
