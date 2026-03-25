import { Injectable } from "@nestjs/common";
import { PrismaQuoteBatchesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-batches.repository";

type QuoteBatchStatusCode = "DRAFT" | "FINALIZED" | "EXPIRED" | "CANCELED";

@Injectable()
export class ListQuoteBatchesUseCase {
  constructor(private readonly quoteBatchesRepo: PrismaQuoteBatchesRepository) {}

  execute(
    branchCode: string,
    filters: {
      status?: QuoteBatchStatusCode;
      customerName?: string;
      customerReference?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    }
  ) {
    return this.quoteBatchesRepo.list(branchCode, filters);
  }
}
