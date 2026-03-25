import { Injectable } from "@nestjs/common";
import { PrismaScrapsRepository } from "../../../scraps/infrastructure/persistence/prisma/prisma-scraps.repository";
import { PrismaSalesRepository } from "../../infrastructure/persistence/prisma/prisma-sales.repository";

@Injectable()
export class SalesOperationsService {
  constructor(
    private readonly salesRepo: PrismaSalesRepository,
    private readonly scrapsRepo: PrismaScrapsRepository
  ) {}

  createFromQuote(input: Parameters<PrismaSalesRepository["createFromQuote"]>[0]) {
    return this.salesRepo.createFromQuote(input);
  }

  createDraft(input: Parameters<PrismaSalesRepository["createDraft"]>[0]) {
    return this.salesRepo.createDraft(input);
  }

  addLine(
    saleId: Parameters<PrismaSalesRepository["addLine"]>[0],
    input: Parameters<PrismaSalesRepository["addLine"]>[1]
  ) {
    return this.salesRepo.addLine(saleId, input);
  }

  confirm(saleId: Parameters<PrismaSalesRepository["confirm"]>[0]) {
    return this.salesRepo.confirm(saleId);
  }

  cancel(
    saleId: Parameters<PrismaSalesRepository["cancel"]>[0],
    canceledReason: Parameters<PrismaSalesRepository["cancel"]>[1]
  ) {
    return this.salesRepo.cancel(saleId, canceledReason);
  }

  allocateScrapToLine(input: Parameters<PrismaScrapsRepository["allocateToSaleLine"]>[0]) {
    return this.scrapsRepo.allocateToSaleLine(input);
  }

  matchForSaleLine(input: Parameters<PrismaScrapsRepository["matchForSaleLine"]>[0]) {
    return this.scrapsRepo.matchForSaleLine(input);
  }

  allocateScrapToPiece(input: Parameters<PrismaScrapsRepository["allocateToSaleLinePiece"]>[0]) {
    return this.scrapsRepo.allocateToSaleLinePiece(input);
  }

  releaseAllocation(input: Parameters<PrismaScrapsRepository["releaseAllocation"]>[0]) {
    return this.scrapsRepo.releaseAllocation(input);
  }

  releasePieceAllocation(input: Parameters<PrismaScrapsRepository["releasePieceAllocation"]>[0]) {
    return this.scrapsRepo.releasePieceAllocation(input);
  }

  updateCustomer(
    saleId: Parameters<PrismaSalesRepository["updateCustomer"]>[0],
    actorEmail: Parameters<PrismaSalesRepository["updateCustomer"]>[1],
    input: Parameters<PrismaSalesRepository["updateCustomer"]>[2]
  ) {
    return this.salesRepo.updateCustomer(saleId, actorEmail, input);
  }

  updatePaymentSummary(
    saleId: Parameters<PrismaSalesRepository["updatePaymentSummary"]>[0],
    amountPaid: Parameters<PrismaSalesRepository["updatePaymentSummary"]>[1]
  ) {
    return this.salesRepo.updatePaymentSummary(saleId, amountPaid);
  }

  updateLine(
    saleId: Parameters<PrismaSalesRepository["updateLine"]>[0],
    saleLineId: Parameters<PrismaSalesRepository["updateLine"]>[1],
    actorEmail: Parameters<PrismaSalesRepository["updateLine"]>[2],
    input: Parameters<PrismaSalesRepository["updateLine"]>[3]
  ) {
    return this.salesRepo.updateLine(saleId, saleLineId, actorEmail, input);
  }

  removeLine(
    saleId: Parameters<PrismaSalesRepository["removeLine"]>[0],
    saleLineId: Parameters<PrismaSalesRepository["removeLine"]>[1],
    actorEmail: Parameters<PrismaSalesRepository["removeLine"]>[2]
  ) {
    return this.salesRepo.removeLine(saleId, saleLineId, actorEmail);
  }

  list(branchCode: Parameters<PrismaSalesRepository["list"]>[0]) {
    return this.salesRepo.list(branchCode);
  }

  commitAutoAssignment(input: Parameters<PrismaScrapsRepository["commitAutoAssignment"]>[0]) {
    return this.scrapsRepo.commitAutoAssignment(input);
  }

  getPrintableSale(saleId: Parameters<PrismaSalesRepository["getPrintableSale"]>[0]) {
    return this.salesRepo.getPrintableSale(saleId);
  }

  listCutJobs(input: Parameters<PrismaSalesRepository["listCutJobs"]>[0]) {
    return this.salesRepo.listCutJobs(input);
  }
}
