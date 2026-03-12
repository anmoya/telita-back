import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaSalesRepository } from "../../infrastructure/persistence/prisma/prisma-sales.repository";
import { PrismaScrapsRepository } from "../../../scraps/infrastructure/persistence/prisma/prisma-scraps.repository";
import { PrismaSettingsRepository } from "../../../settings/infrastructure/persistence/prisma/prisma-settings.repository";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { prismaClient } from "../../../../shared/infrastructure/persistence/prisma-client";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("cut-jobs")
export class CutJobsController {
  private readonly repo = new PrismaSalesRepository();
  private readonly scrapsRepo = new PrismaScrapsRepository();
  private readonly settingsRepo = new PrismaSettingsRepository();
  private readonly auditRepo = new PrismaAuditRepository();

  @Get()
  async list(
    @Query("saleId") saleId?: string,
    @Query("branchCode") branchCode = "MAIN",
    @Query("status") status?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    const parsedStatus = parseCutJobStatus(status);
    const rows = await this.repo.listCutJobs({ saleId, branchCode, status: parsedStatus });
    return rows.map((row) => ({
      id: row.id,
      saleId: row.saleLine.saleId,
      saleLineId: row.saleLineId,
      status: row.status,
      cutAt: row.cutAt?.toISOString() ?? null,
      requestedWidthM: Number(row.saleLine.requestedWidthM),
      requestedHeightM: Number(row.saleLine.requestedHeightM),
      quantity: row.saleLine.quantity,
      skuCode: row.saleLine.sku.code,
      skuName: row.saleLine.sku.name,
      saleCreatedAt: row.saleLine.sale.createdAt.toISOString()
    }));
  }

  @Get(":cutJobId/compatible-scraps")
  async compatibleScraps(
    @Param("cutJobId") cutJobId: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const policy = await this.settingsRepo.getCutScrapLookupPolicy();
      if (policy.mode === "OFF") {
        return { policy, saleId: null, cutJobId, lines: [] };
      }

      const result = await this.scrapsRepo.matchForCutJob({
        cutJobId,
        scope: policy.scope,
        maxPerLine: policy.maxSuggestionsPerLine
      });

      const user = await prismaClient.appUser.findUnique({ where: { email: auth.email } });
      if (user) {
        await this.auditRepo.log({
          actorUserId: user.id,
          entityType: "cut_job",
          entityId: cutJobId,
          action: AuditAction.STATUS_CHANGE,
          afterJson: {
            event: "CUT_COMPATIBLE_SCRAPS_CHECKED",
            suggestionsFound: result.lines.reduce((acc, l) => acc + l.suggestions.length, 0),
            mode: policy.mode,
            scope: policy.scope
          }
        });
      }

      return { policy, ...result };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Post(":cutJobId/mark-cut")
  async markCut(
    @Param("cutJobId") cutJobId: string,
    @Body()
    body: {
      scrapWidthM?: number;
      scrapHeightM?: number;
      defaultLocationCode?: string;
      locationCode?: string;
      pieceLocations?: Array<{ saleLinePieceId?: string; pieceIndex?: number; locationCode: string }>;
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const cutJob = await this.repo.markCut(cutJobId, auth.email);

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

      const scrapPolicy = await this.settingsRepo.getScrapPolicy();
      const defaultLocationCode = body.defaultLocationCode ?? body.locationCode;
      const pieceLocations = new Map<string, string>();
      for (const item of body.pieceLocations ?? []) {
        if (item.saleLinePieceId) pieceLocations.set(item.saleLinePieceId, item.locationCode);
        else if (typeof item.pieceIndex === "number") pieceLocations.set(`piece:${item.pieceIndex}`, item.locationCode);
      }
      const projections = pieces
        .map((piece) => {
          const defaultScrapWidthM = Math.max(skuWidthM - Number(piece.requestedWidthM), 0);
          const defaultScrapHeightM = Math.max(Number(piece.requestedHeightM), 0);
          const scrapWidthM = body.scrapWidthM ?? defaultScrapWidthM;
          const scrapHeightM = body.scrapHeightM ?? defaultScrapHeightM;
          return {
            piece,
            scrapWidthM,
            scrapHeightM
          };
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
          generatedByEmail: auth.email,
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
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }
}

function parseCutJobStatus(status?: string): "PENDING" | "IN_PROGRESS" | "CUT" | "DELIVERED" | undefined {
  if (!status) return undefined;
  if (status === "PENDING" || status === "IN_PROGRESS" || status === "CUT" || status === "DELIVERED") {
    return status;
  }
  throw new BadRequestException("Invalid cut job status filter.");
}
