import { Injectable } from "@nestjs/common";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaSalesRepository } from "../../infrastructure/persistence/prisma/prisma-sales.repository";
import { PrismaScrapsRepository } from "../../../scraps/infrastructure/persistence/prisma/prisma-scraps.repository";
import { PrismaSettingsRepository } from "../../../settings/infrastructure/persistence/prisma/prisma-settings.repository";

@Injectable()
export class CutJobsWorkflowService {
  constructor(
    private readonly salesRepo: PrismaSalesRepository,
    private readonly scrapsRepo: PrismaScrapsRepository,
    private readonly settingsRepo: PrismaSettingsRepository,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async getCompatibleScraps(input: { cutJobId: string; actorEmail: string }) {
    const policy = await this.settingsRepo.getCutScrapLookupPolicy();
    if (policy.mode === "OFF") {
      return { policy, saleId: null, cutJobId: input.cutJobId, lines: [] };
    }

    const result = await this.scrapsRepo.matchForCutJob({
      cutJobId: input.cutJobId,
      scope: policy.scope,
      maxPerLine: policy.maxSuggestionsPerLine
    });

    await this.auditRepo.logByActorEmail({
      actorEmail: input.actorEmail,
      entityType: "cut_job",
      entityId: input.cutJobId,
      action: "STATUS_CHANGE",
      afterJson: {
        event: "CUT_COMPATIBLE_SCRAPS_CHECKED",
        suggestionsFound: result.lines.reduce((acc, line) => acc + line.suggestions.length, 0),
        mode: policy.mode,
        scope: policy.scope
      }
    });

    return { policy, ...result };
  }

  async markCutAndRegisterScraps(input: {
    cutJobId: string;
    actorEmail: string;
    scrapWidthM?: number;
    scrapHeightM?: number;
    defaultLocationCode?: string;
    locationCode?: string;
    pieceLocations?: Array<{ saleLinePieceId?: string; pieceIndex?: number; locationCode: string }>;
  }) {
    const cutJob = await this.salesRepo.markCut(input.cutJobId, input.actorEmail);

    const saleLine = cutJob.saleLine;
    const sku = saleLine.sku;
    const skuWidthM = Number(sku.widthValue) * Number(sku.widthUnit.toMeterFactor);
    const pieces = saleLine.pieces.length > 0
      ? saleLine.pieces
      : Array.from({ length: saleLine.quantity }, (_, index) => ({
          id: undefined,
          pieceIndex: index + 1,
          pieceTotal: saleLine.quantity,
          requestedWidthM: saleLine.requestedWidthM,
          requestedHeightM: saleLine.requestedHeightM,
          roomAreaName: null
        }));

    const pieceIds = pieces.map((piece) => piece.id).filter((value): value is string => Boolean(value));
    if (pieceIds.length > 0) {
      await this.scrapsRepo.releaseSoftHoldsByCriteria({
        releasedByEmail: input.actorEmail,
        saleLineId: saleLine.id,
        saleLinePieceIds: pieceIds
      });
    }

    const scrapPolicy = await this.settingsRepo.getScrapPolicy();
    const defaultLocationCode = input.defaultLocationCode ?? input.locationCode;
    const pieceLocations = new Map<string, string>();
    for (const item of input.pieceLocations ?? []) {
      if (item.saleLinePieceId) pieceLocations.set(item.saleLinePieceId, item.locationCode);
      else if (typeof item.pieceIndex === "number") pieceLocations.set(`piece:${item.pieceIndex}`, item.locationCode);
    }

    const projections = pieces
      .map((piece) => {
        const defaultScrapWidthM = Math.max(skuWidthM - Number(piece.requestedWidthM), 0);
        const defaultScrapHeightM = Math.max(Number(piece.requestedHeightM), 0);
        const scrapWidthM = input.scrapWidthM ?? defaultScrapWidthM;
        const scrapHeightM = input.scrapHeightM ?? defaultScrapHeightM;
        return { piece, scrapWidthM, scrapHeightM };
      })
      .filter((projection) => projection.scrapWidthM > 0 && projection.scrapHeightM > 0);

    const scraps = [];
    for (const projection of projections) {
      const locationCode =
        (projection.piece.id ? pieceLocations.get(projection.piece.id) : undefined)
        ?? pieceLocations.get(`piece:${projection.piece.pieceIndex}`)
        ?? defaultLocationCode;

      const scrap = await this.scrapsRepo.registerFromCutJob({
        cutJobId: cutJob.id,
        saleLineId: saleLine.id,
        saleLinePieceId: projection.piece.id,
        branchId: saleLine.sale.branchId,
        skuId: sku.id,
        scrapWidthM: projection.scrapWidthM,
        scrapHeightM: projection.scrapHeightM,
        generatedByEmail: input.actorEmail,
        locationPolicy: scrapPolicy.locationPolicy,
        locationCode
      });

      scraps.push({
        id: scrap.id,
        status: scrap.status,
        widthM: Number(scrap.widthM),
        heightM: Number(scrap.heightM),
        areaM2: Number(scrap.areaM2),
        locationCode: locationCode ?? null,
        isUseful: scrap.isUseful,
        pieceIndex: projection.piece.pieceIndex,
        pieceTotal: projection.piece.pieceTotal
      });
    }

    return {
      ok: true,
      scrap: scraps[0] ?? null,
      locationPolicy: scrapPolicy.locationPolicy,
      scraps
    };
  }
}
