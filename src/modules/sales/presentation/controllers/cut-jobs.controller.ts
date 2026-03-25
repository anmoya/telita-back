import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { CutJobsWorkflowService } from "../../application/services/cut-jobs-workflow.service";
import { SalesOperationsService } from "../../application/services/sales-operations.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";

@Authenticated("superadmin", "admin", "operador")
@Controller("cut-jobs")
export class CutJobsController {
  constructor(
    private readonly salesOperations: SalesOperationsService,
    private readonly workflow: CutJobsWorkflowService
  ) {}

  @Get()
  async list(
    @Query("saleId") saleId?: string,
    @Query("search") search?: string,
    @Query("branchCode") branchCode = "MAIN",
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const parsedStatus = parseCutJobStatus(status);
    const result = await this.salesOperations.listCutJobs({
      saleId,
      search,
      branchCode,
      status: parsedStatus,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
    return {
      data: result.data.map((row) => ({
      id: row.id,
      saleId: row.saleLine.saleId,
      saleLineId: row.saleLineId,
      quoteCode: row.saleLine.sale.quoteNumber ? `COT-${row.saleLine.sale.quoteNumber}` : null,
      status: row.status,
      cutAt: row.cutAt?.toISOString() ?? null,
      requestedWidthM: Number(row.saleLine.requestedWidthM),
      requestedHeightM: Number(row.saleLine.requestedHeightM),
      quantity: row.saleLine.quantity,
      skuCode: row.saleLine.sku.code,
      skuName: row.saleLine.sku.name,
      saleCreatedAt: row.saleLine.sale.createdAt.toISOString()
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    };
  }

  @Get(":cutJobId/compatible-scraps")
  async compatibleScraps(@Param("cutJobId") cutJobId: string, @CurrentAuth() auth: AuthTokenPayload) {
    return this.workflow.getCompatibleScraps({
      cutJobId,
      actorEmail: auth.email,
    });
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
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    return this.workflow.markCutAndRegisterScraps({
      cutJobId,
      actorEmail: auth.email,
      ...body
    });
  }
}

function parseCutJobStatus(status?: string): "PENDING" | "IN_PROGRESS" | "CUT" | "DELIVERED" | undefined {
  if (!status) return undefined;
  if (status === "PENDING" || status === "IN_PROGRESS" || status === "CUT" || status === "DELIVERED") {
    return status;
  }
  throw new BadRequestException("Invalid cut job status filter.");
}
