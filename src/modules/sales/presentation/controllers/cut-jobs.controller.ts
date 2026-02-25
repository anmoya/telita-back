import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { PrismaSalesRepository } from "../../infrastructure/persistence/prisma/prisma-sales.repository";
import { PrismaScrapsRepository } from "../../../scraps/infrastructure/persistence/prisma/prisma-scraps.repository";
import { PrismaSettingsRepository } from "../../../settings/infrastructure/persistence/prisma/prisma-settings.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("cut-jobs")
export class CutJobsController {
  private readonly repo = new PrismaSalesRepository();
  private readonly scrapsRepo = new PrismaScrapsRepository();
  private readonly settingsRepo = new PrismaSettingsRepository();

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

  @Post(":cutJobId/mark-cut")
  async markCut(
    @Param("cutJobId") cutJobId: string,
    @Body() body: { scrapWidthM?: number; scrapHeightM?: number; locationCode?: string },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const cutJob = await this.repo.markCut(cutJobId, auth.email);

      const saleLine = cutJob.saleLine;
      const sku = saleLine.sku;
      const skuWidthM = Number(sku.widthValue) * Number(sku.widthUnit.toMeterFactor);
      const skuLengthM = Number(sku.lengthValue) * Number(sku.lengthUnit.toMeterFactor);

      const scrapWidthM = body.scrapWidthM ?? skuWidthM;
      const calculatedScrapHeightM = Math.max(
        skuLengthM - Number(saleLine.requestedHeightM) * saleLine.quantity,
        0
      );
      const scrapHeightM = body.scrapHeightM ?? calculatedScrapHeightM;

      let scrap = null;
      if (scrapWidthM > 0 && scrapHeightM > 0) {
        const rules = await this.settingsRepo.getFlowRules();
        const threshold = await this.scrapsRepo.getGlobalThresholdArea(saleLine.sale.branchId);
        const projectedArea = scrapWidthM * scrapHeightM;

        if (rules.scrapRequiredAtStage === "AT_CUT" && projectedArea >= threshold && !body.locationCode) {
          throw new Error(
            `Retazo util (${projectedArea.toFixed(2)} m²) requiere ubicacion al cerrar corte. Proporcione locationCode en el cuerpo de la solicitud.`
          );
        }

        scrap = await this.scrapsRepo.registerFromCutJob({
          cutJobId: cutJob.id,
          saleLineId: saleLine.id,
          branchId: saleLine.sale.branchId,
          skuId: sku.id,
          scrapWidthM,
          scrapHeightM,
          generatedByEmail: auth.email
        });

        if (body.locationCode && scrap.status === "PENDING_STORAGE") {
          scrap = await this.scrapsRepo.assignLocation({
            scrapId: scrap.id,
            locationCode: body.locationCode,
            classifiedByEmail: auth.email
          });
        }
      }

      return {
        ok: true,
        scrap: scrap
          ? {
              id: scrap.id,
              status: scrap.status,
              widthM: Number(scrap.widthM),
              heightM: Number(scrap.heightM),
              areaM2: Number(scrap.areaM2)
            }
          : null
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
