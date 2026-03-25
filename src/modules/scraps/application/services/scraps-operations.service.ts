import { Injectable } from "@nestjs/common";
import { PrismaScrapsRepository } from "../../infrastructure/persistence/prisma/prisma-scraps.repository";

@Injectable()
export class ScrapsOperationsService {
  constructor(private readonly scrapsRepo: PrismaScrapsRepository) {}

  registerFromQuote(input: { quoteId: string; generatedByEmail: string }) {
    return this.scrapsRepo.registerFromQuote(input);
  }

  match(input: {
    branchCode: string;
    skuCode: string;
    requestedWidthM: number;
    requestedHeightM: number;
    limit: number;
  }) {
    return this.scrapsRepo.match(input);
  }

  previewQuoteOpportunity(input: {
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
    return this.scrapsRepo.previewQuoteOpportunity(input);
  }

  list(input: {
    branchCode?: string;
    status?: string;
    quoteNumber?: number;
    page?: number;
    limit?: number;
  }) {
    return this.scrapsRepo.list(input);
  }

  assignLocation(input: { scrapId: string; locationCode: string; classifiedByEmail: string }) {
    return this.scrapsRepo.assignLocation(input);
  }

  createSoftHold(input: {
    scrapId: string;
    saleId: string;
    saleLineId?: string;
    saleLinePieceId?: string;
    heldByEmail: string;
    minutes: number;
    reason?: string;
  }) {
    return this.scrapsRepo.createSoftHold(input);
  }

  getActiveSoftHold(scrapId: string) {
    return this.scrapsRepo.getActiveSoftHold(scrapId);
  }

  releaseSoftHold(input: { scrapId: string; releasedByEmail: string }) {
    return this.scrapsRepo.releaseSoftHold(input);
  }
}
