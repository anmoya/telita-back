import { Injectable } from "@nestjs/common";
import { PrismaClient, ScrapStatus, SoftHoldStatus } from "@prisma/client";
import { AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { ScrapSoftHoldsService } from "./scrap-soft-holds.service";

@Injectable()
export class ScrapMatchingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly softHolds: ScrapSoftHoldsService
  ) {}

  async match(params: {
    branchCode: string;
    skuCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    limit?: number;
  }) {
    await this.softHolds.expireStaleHolds();

    const scraps = await this.prisma.scrap.findMany({
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
      .map((scrap) => ({ ...scrap, excessAreaM2: Number(scrap.areaM2) - requestedArea }))
      .sort((a, b) => a.excessAreaM2 - b.excessAreaM2);
  }

  async previewQuoteOpportunity(params: {
    branchCode: string;
    items: Array<{
      itemId: string;
      itemIndex: number;
      skuCode: string;
      requestedWidthM: number;
      requestedHeightM: number;
      quantity: number;
    }>;
  }) {
    await this.softHolds.expireStaleHolds();

    const eligibleItems = params.items.filter((item) =>
      Boolean(item.skuCode)
      && Number.isFinite(item.requestedWidthM)
      && item.requestedWidthM > 0
      && Number.isFinite(item.requestedHeightM)
      && item.requestedHeightM > 0
      && Number.isFinite(item.quantity)
      && item.quantity > 0
    );

    const results = await Promise.all(
      eligibleItems.map(async (item) => {
        const qty = Math.max(1, Number(item.quantity));
        const matches = await this.match({
          branchCode: params.branchCode,
          skuCode: item.skuCode,
          requestedWidthM: Number(item.requestedWidthM),
          requestedHeightM: Number(item.requestedHeightM),
          limit: Math.min(qty, 10)
        });

        return matches.slice(0, qty).map((match, matchIndex) => ({
          key: `${item.itemId}-${match.id}-${matchIndex + 1}`,
          itemId: item.itemId,
          itemIndex: item.itemIndex,
          pieceIndex: matchIndex + 1,
          pieceTotal: qty,
          skuCode: item.skuCode,
          requestedWidthM: Number(item.requestedWidthM),
          requestedHeightM: Number(item.requestedHeightM),
          scrapId: match.id,
          locationCode: match.location?.code ?? null,
          areaM2: Number(match.areaM2),
          excessAreaM2: Number(match.excessAreaM2.toFixed(3))
        }));
      })
    );

    const items = results.flat().sort((a, b) => {
      if (a.itemIndex !== b.itemIndex) return a.itemIndex - b.itemIndex;
      return a.pieceIndex - b.pieceIndex;
    });
    const linesWithOpportunity = new Set(items.map((item) => item.itemId)).size;
    const totalPieces = eligibleItems.reduce((sum, item) => sum + Math.max(1, Number(item.quantity)), 0);

    return {
      items,
      summary: {
        assignedPieces: items.length,
        totalPieces,
        linesWithOpportunity
      }
    };
  }

  async matchForCutJob(params: {
    cutJobId: string;
    scope: "CURRENT_LINE" | "ENTIRE_ORDER";
    maxPerLine: number;
  }) {
    const cutJob = await this.prisma.cutJob.findUnique({
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
    if (!cutJob) throw new AppNotFoundError("Trabajo de corte no encontrado.");

    const sale = cutJob.saleLine.sale;
    const linesToCheck = params.scope === "ENTIRE_ORDER" ? sale.lines : [cutJob.saleLine];
    const lines = [];

    for (const line of linesToCheck) {
      const matches = await this.match({
        branchCode: sale.branch.code,
        skuCode: line.sku.code,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        limit: params.maxPerLine
      });

      lines.push({
        saleLineId: line.id,
        skuCode: line.sku.code,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        suggestions: matches.map((match) => ({
          scrapId: match.id,
          locationCode: match.location?.code ?? null,
          widthM: Number(match.widthM),
          heightM: Number(match.heightM),
          fitScore: Number(match.excessAreaM2.toFixed(3))
        }))
      });
    }

    return {
      saleId: sale.id,
      cutJobId: cutJob.id,
      lines
    };
  }

  async matchForSaleLines(params: {
    saleId: string;
    lineIds?: string[];
    limitPerLine: number;
  }) {
    await this.softHolds.expireStaleHolds();

    const sale = await this.prisma.sale.findUnique({
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
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");

    const linesToCheck = params.lineIds
      ? sale.lines.filter((line) => params.lineIds!.includes(line.id))
      : sale.lines;
    const eligibleLines = linesToCheck.filter((line) => line.pieces.some((piece) => piece.allocations.length === 0));
    const results = [];

    for (const line of eligibleLines) {
      const matches = await this.match({
        branchCode: sale.branch.code,
        skuCode: line.sku.code,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
        limit: params.limitPerLine
      });

      const labelMap = await this.getLabelMap(matches.map((match) => match.id));
      results.push({
        saleLineId: line.id,
        skuCode: line.sku.code,
        requestedWidthM: Number(line.requestedWidthM),
        requestedHeightM: Number(line.requestedHeightM),
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
      });
    }

    return { saleId: sale.id, lines: results };
  }

  async matchForSaleLine(params: { saleId: string; saleLineId: string; limit?: number }) {
    await this.softHolds.expireStaleHolds();

    const line = await this.prisma.saleLine.findFirst({
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
    if (!line) throw new AppNotFoundError("Línea de venta no encontrada.");

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

    const labelMap = await this.getLabelMap(matches.map((match) => match.id));
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

  async previewAutoAssignment(params: { saleId: string; limitPerPiece?: number }) {
    await this.softHolds.expireStaleHolds();

    const sale = await this.prisma.sale.findUnique({
      where: { id: params.saleId },
      include: {
        branch: true,
        lines: {
          include: {
            sku: true,
            pieces: {
              include: {
                allocations: { where: { isActive: true }, select: { id: true } }
              },
              orderBy: { pieceIndex: "asc" }
            }
          },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");
    if (sale.status !== "DRAFT") throw new AppValidationError("La autoasignación solo está disponible para ventas DRAFT.");

    const limit = Math.max(1, Math.min(params.limitPerPiece ?? 10, 20));
    const reservedScrapIds = new Set<string>();
    const items = [];
    const unmatchedPieces = [];

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
        const labelMap = await this.getLabelMap([chosen.id]);
        items.push({
          saleLineId: line.id,
          saleLinePieceId: piece.id,
          pieceIndex: piece.pieceIndex,
          pieceTotal: piece.pieceTotal,
          skuCode: line.sku.code,
          requestedWidthM: Number(piece.requestedWidthM),
          requestedHeightM: Number(piece.requestedHeightM),
          scrapId: chosen.id,
          labelCode: labelMap.get(chosen.id) ?? chosen.id.slice(0, 8),
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

  private async getLabelMap(scrapIds: string[]) {
    if (scrapIds.length === 0) return new Map<string, string>();
    const labels = await this.prisma.label.findMany({
      where: { scrapId: { in: scrapIds } },
      select: { scrapId: true, id: true }
    });
    return new Map(labels.map((label) => [label.scrapId, label.id.slice(0, 8)]));
  }
}
