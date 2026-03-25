import { Injectable } from "@nestjs/common";
import { PrismaLabelsRepository } from "../../infrastructure/persistence/prisma/prisma-labels.repository";

@Injectable()
export class LabelsOperationsService {
  constructor(private readonly labelsRepo: PrismaLabelsRepository) {}

  createFromQuote(quoteId: string, createdByEmail: string) {
    return this.labelsRepo.createFromQuote(quoteId, createdByEmail);
  }

  createFromScrap(scrapId: string, createdByEmail: string) {
    return this.labelsRepo.createFromScrap(scrapId, createdByEmail);
  }

  createBatchFromSale(saleId: string, createdByEmail: string) {
    return this.labelsRepo.createBatchFromSale(saleId, createdByEmail);
  }

  list(input: {
    branchCode?: string;
    saleLineId?: string;
    scrapId?: string;
    quoteId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    return this.labelsRepo.list(input);
  }

  getHtmlContent(labelId: string) {
    return this.labelsRepo.getHtmlContent(labelId);
  }

  getZplContent(labelId: string) {
    return this.labelsRepo.getZplContent(labelId);
  }

  createBatch(input: {
    branchCode: string;
    items: Array<{
      type: "SALE_LINE" | "SCRAP";
      saleLineId?: string;
      scrapId?: string;
    }>;
    createdByEmail: string;
  }) {
    return this.labelsRepo.createBatch(input);
  }

  getBatchHtmlContent(labelIds: string[]) {
    return this.labelsRepo.getBatchHtmlContent(labelIds);
  }

  getBatchZplContent(labelIds: string[]) {
    return this.labelsRepo.getBatchZplContent(labelIds);
  }

  batchReprint(labelIds: string[], printedByEmail: string) {
    return this.labelsRepo.batchReprint(labelIds, printedByEmail);
  }

  reprint(labelId: string, printedByEmail: string) {
    return this.labelsRepo.reprint(labelId, printedByEmail);
  }
}
