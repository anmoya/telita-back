import { Injectable } from "@nestjs/common";
import { AuditAction, PrismaClient, ScrapStatus, SoftHoldStatus } from "@prisma/client";
import { AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaSettingsRepository } from "../../../settings/infrastructure/persistence/prisma/prisma-settings.repository";
import { evaluateScrapRule, type ScrapLocationPolicy, type ScrapRuleContext } from "../../domain/scrap-policy";
import { ScrapMatchingService } from "./scrap-matching.service";
import { ScrapSoftHoldsService } from "./scrap-soft-holds.service";

@Injectable()
export class ScrapCutOperationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository,
    private readonly settingsRepo: PrismaSettingsRepository,
    private readonly matching: ScrapMatchingService,
    private readonly softHolds: ScrapSoftHoldsService
  ) {}

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
    const user = await this.prisma.appUser.findUnique({ where: { email: input.generatedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const sku = await this.prisma.fabricSku.findUnique({
      where: { id: input.skuId },
      include: { widthUnit: true, lengthUnit: true, thicknessUnit: true }
    });
    if (!sku) throw new AppNotFoundError("SKU no encontrado.");

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
        throw new AppValidationError("Debe indicar una ubicacion al cerrar el corte para retazos utiles.");
      }
      const location = await this.prisma.storageLocation.findFirst({
        where: { branchId: input.branchId, code: input.locationCode, isActive: true }
      });
      if (!location) throw new AppNotFoundError("Ubicación no encontrada.");
      locationId = location.id;
    }

    const status = !isUseful
      ? ScrapStatus.DISCARDED
      : shouldStoreNow
        ? ScrapStatus.STORED
        : ScrapStatus.PENDING_INBOUND;

    const scrap = await this.prisma.scrap.create({
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

  async generateCutSheet(input: { saleId: string; requestedByEmail: string; reserveSuggestedScraps: boolean }) {
    await this.softHolds.expireStaleHolds();

    const user = await this.prisma.appUser.findUnique({ where: { email: input.requestedByEmail } });
    if (!user) throw new AppNotFoundError("Usuario no encontrado.");

    const cutSheetPolicy = await this.settingsRepo.getCutSheetPolicy();
    if (cutSheetPolicy.mode === "DISABLED") {
      throw new AppValidationError("La hoja de corte está deshabilitada.");
    }

    const softHoldPolicy = await this.settingsRepo.getSoftHoldPolicy();
    const shouldReserve = cutSheetPolicy.mode === "GUIDE_ONLY" ? false : input.reserveSuggestedScraps;
    if (shouldReserve && !softHoldPolicy.enabled) {
      throw new AppValidationError("La reserva temporal de retazos no está habilitada.");
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: input.saleId },
      include: {
        branch: true,
        customer: true,
        lines: {
          include: {
            sku: true,
            pieces: {
              include: {
                allocations: {
                  where: { isActive: true },
                  include: { scrap: { include: { location: true } } }
                }
              },
              orderBy: { pieceIndex: "asc" }
            }
          },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });
    if (!sale) throw new AppNotFoundError("Venta no encontrada.");
    if (sale.status !== "CONFIRMED") throw new AppValidationError("La hoja de corte solo está disponible para ventas CONFIRMED.");

    const activeHolds = await this.prisma.scrapSoftHold.findMany({
      where: { saleId: sale.id, status: SoftHoldStatus.ACTIVE, expiresAt: { gt: new Date() } },
      include: {
        scrap: {
          include: {
            location: true,
            allocations: { where: { isActive: true }, select: { id: true } }
          }
        }
      }
    });

    const holdsByPiece = new Map<string, (typeof activeHolds)[number]>();
    for (const hold of activeHolds) {
      if (hold.saleLinePieceId) holdsByPiece.set(hold.saleLinePieceId, hold);
    }

    const reuseRows: Array<{
      saleLineId: string;
      saleLinePieceId: string;
      pieceIndex: number;
      pieceTotal: number;
      skuCode: string;
      skuName: string;
      roomAreaName: string | null;
      requestedWidthM: number;
      requestedHeightM: number;
      scrapId: string;
      locationCode: string | null;
      scrapWidthM: number;
      scrapHeightM: number;
      stateLabel: string;
    }> = [];
    const cutRows: Array<{
      saleLineId: string;
      saleLinePieceId: string;
      pieceIndex: number;
      pieceTotal: number;
      skuCode: string;
      skuName: string;
      roomAreaName: string | null;
      requestedWidthM: number;
      requestedHeightM: number;
      reason: string;
    }> = [];

    const pickedScrapIds = new Set<string>();
    const keepHoldIds = new Set<string>();

    for (const line of sale.lines) {
      for (const piece of line.pieces) {
        if (piece.allocations.length > 0) {
          const allocation = piece.allocations[0];
          pickedScrapIds.add(allocation.scrapId);
          reuseRows.push({
            saleLineId: line.id,
            saleLinePieceId: piece.id,
            pieceIndex: piece.pieceIndex,
            pieceTotal: piece.pieceTotal,
            skuCode: line.sku.code,
            skuName: line.sku.name,
            roomAreaName: piece.roomAreaName ?? line.roomAreaName ?? null,
            requestedWidthM: Number(piece.requestedWidthM),
            requestedHeightM: Number(piece.requestedHeightM),
            scrapId: allocation.scrapId,
            locationCode: allocation.scrap.location?.code ?? null,
            scrapWidthM: Number(allocation.scrap.widthM),
            scrapHeightM: Number(allocation.scrap.heightM),
            stateLabel: "Asignado"
          });
          continue;
        }

        const existingHold = holdsByPiece.get(piece.id);
        let chosen:
          | {
              scrapId: string;
              widthM: number;
              heightM: number;
              locationCode: string | null;
              existingHoldId?: string;
              stateLabel: string;
            }
          | null = null;

        const holdScrapAvailable = existingHold
          && existingHold.scrap.status === ScrapStatus.STORED
          && existingHold.scrap.allocations.length === 0
          && !pickedScrapIds.has(existingHold.scrapId);

        if (holdScrapAvailable) {
          chosen = {
            scrapId: existingHold.scrapId,
            widthM: Number(existingHold.scrap.widthM),
            heightM: Number(existingHold.scrap.heightM),
            locationCode: existingHold.scrap.location?.code ?? null,
            existingHoldId: existingHold.id,
            stateLabel: "Reservado"
          };
          keepHoldIds.add(existingHold.id);
        } else {
          const matches = await this.matching.match({
            branchCode: sale.branch.code,
            skuCode: line.sku.code,
            requestedWidthM: Number(piece.requestedWidthM),
            requestedHeightM: Number(piece.requestedHeightM),
            limit: 10
          });
          const match = matches.find((candidate) => !pickedScrapIds.has(candidate.id));
          if (match) {
            chosen = {
              scrapId: match.id,
              widthM: Number(match.widthM),
              heightM: Number(match.heightM),
              locationCode: match.location?.code ?? null,
              stateLabel: shouldReserve ? "Reservado" : "Solo guía"
            };
          }
        }

        if (!chosen) {
          cutRows.push({
            saleLineId: line.id,
            saleLinePieceId: piece.id,
            pieceIndex: piece.pieceIndex,
            pieceTotal: piece.pieceTotal,
            skuCode: line.sku.code,
            skuName: line.sku.name,
            roomAreaName: piece.roomAreaName ?? line.roomAreaName ?? null,
            requestedWidthM: Number(piece.requestedWidthM),
            requestedHeightM: Number(piece.requestedHeightM),
            reason: "Sin retazo sugerido"
          });
          continue;
        }

        pickedScrapIds.add(chosen.scrapId);

        if (shouldReserve) {
          const expiresAt = new Date(Date.now() + softHoldPolicy.defaultMinutes * 60_000);
          if (chosen.existingHoldId) {
            await this.prisma.scrapSoftHold.update({
              where: { id: chosen.existingHoldId },
              data: { expiresAt, reason: "cut_sheet" }
            });
          } else {
            if (existingHold?.id) {
              await this.softHolds.releaseSoftHoldsByCriteria({
                releasedByEmail: input.requestedByEmail,
                holdIds: [existingHold.id]
              });
            }
            const createdHold = await this.softHolds.createSoftHold({
              scrapId: chosen.scrapId,
              saleId: sale.id,
              saleLineId: line.id,
              saleLinePieceId: piece.id,
              heldByEmail: input.requestedByEmail,
              minutes: softHoldPolicy.defaultMinutes,
              reason: "cut_sheet"
            });
            keepHoldIds.add(createdHold.id);
          }
        }

        reuseRows.push({
          saleLineId: line.id,
          saleLinePieceId: piece.id,
          pieceIndex: piece.pieceIndex,
          pieceTotal: piece.pieceTotal,
          skuCode: line.sku.code,
          skuName: line.sku.name,
          roomAreaName: piece.roomAreaName ?? line.roomAreaName ?? null,
          requestedWidthM: Number(piece.requestedWidthM),
          requestedHeightM: Number(piece.requestedHeightM),
          scrapId: chosen.scrapId,
          locationCode: chosen.locationCode,
          scrapWidthM: chosen.widthM,
          scrapHeightM: chosen.heightM,
          stateLabel: chosen.stateLabel
        });
      }
    }

    if (shouldReserve) {
      const staleHoldIds = activeHolds
        .filter((hold) => hold.saleLinePieceId && !keepHoldIds.has(hold.id))
        .map((hold) => hold.id);
      if (staleHoldIds.length > 0) {
        await this.softHolds.releaseSoftHoldsByCriteria({
          releasedByEmail: input.requestedByEmail,
          holdIds: staleHoldIds
        });
      }
    }

    const labels = reuseRows.length > 0
      ? await this.prisma.label.findMany({
          where: { scrapId: { in: reuseRows.map((row) => row.scrapId) } },
          select: { scrapId: true, id: true }
        })
      : [];
    const labelByScrapId = new Map(labels.map((label) => [label.scrapId, label.id.slice(0, 8)]));

    return {
      saleId: sale.id,
      quoteCode: sale.quoteNumber ? `COT-${sale.quoteNumber}` : sale.id.slice(0, 8),
      customerName: sale.customer?.fullName ?? sale.customerName ?? "—",
      customerReference: sale.customer?.companyOrReference ?? sale.customerReference ?? "—",
      branchName: sale.branch.name,
      generatedAt: new Date().toISOString(),
      shouldReserve,
      isGuideOnly: !shouldReserve,
      reuseRows: reuseRows.map((row) => ({
        ...row,
        labelCode: labelByScrapId.get(row.scrapId) ?? row.scrapId.slice(0, 8)
      })),
      cutRows
    };
  }
}

function round3(value: number): number {
  return Number(value.toFixed(3));
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
