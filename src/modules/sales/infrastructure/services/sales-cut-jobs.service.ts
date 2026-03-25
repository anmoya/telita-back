import { Injectable } from "@nestjs/common";
import { AuditAction, CutJobStatus, PrismaClient } from "@prisma/client";
import { AppNotFoundError, AppValidationError } from "../../../../shared/application/errors/app-error";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";

@Injectable()
export class SalesCutJobsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async markCut(cutJobId: string, cutByEmail: string) {
    const user = await this.prisma.appUser.findUnique({ where: { email: cutByEmail } });
    if (!user) throw new AppNotFoundError("Operador de corte no encontrado.");

    const current = await this.prisma.cutJob.findUnique({ where: { id: cutJobId } });
    if (!current) throw new AppNotFoundError("Trabajo de corte no encontrado.");
    if (current.status !== CutJobStatus.PENDING && current.status !== CutJobStatus.IN_PROGRESS) {
      throw new AppValidationError("El trabajo de corte no puede marcarse como CORTADO desde el estado actual.");
    }

    const cutJob = await this.prisma.cutJob.update({
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

  async listCutJobs(params: {
    saleId?: string;
    search?: string;
    branchCode?: string;
    status?: CutJobStatus;
    page?: number;
    limit?: number;
  }) {
    const limit = Math.min(params.limit ?? 8, 100);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * limit;

    let searchQuoteNumber: number | undefined;
    let searchSaleId: string | undefined;
    if (params.search) {
      const cotMatch = params.search.match(/^COT-(\d+)$/i);
      if (cotMatch) {
        searchQuoteNumber = Number(cotMatch[1]);
      } else {
        searchSaleId = params.search;
      }
    }

    const where: any = {
      status: params.status,
      saleLine: {
        saleId: params.saleId ?? (searchSaleId ? { startsWith: searchSaleId } : undefined),
        sale: {
          ...(params.branchCode ? { branch: { code: params.branchCode } } : {}),
          ...(searchQuoteNumber ? { quoteNumber: searchQuoteNumber } : {})
        }
      }
    };

    const [data, total] = await Promise.all([
      this.prisma.cutJob.findMany({
        where,
        include: {
          saleLine: {
            include: {
              sku: { select: { code: true, name: true } },
              sale: { select: { id: true, createdAt: true, quoteNumber: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      this.prisma.cutJob.count({ where })
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}
