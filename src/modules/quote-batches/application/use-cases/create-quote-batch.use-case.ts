import { Injectable } from "@nestjs/common";
import { PrismaQuoteBatchesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-batches.repository";

type PriceMethodCode = "LINEAR_METER" | "AREA" | "FIXED" | "TABLE_LOOKUP";

type LineInput = {
  skuCode: string;
  requestedWidthM: number;
  requestedHeightM: number;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  priceMethod: PriceMethodCode;
  categoryId?: string;
  categoryName?: string;
  lineNote?: string;
  displayOrder?: number;
};

@Injectable()
export class CreateQuoteBatchUseCase {
  constructor(private readonly quoteBatchesRepo: PrismaQuoteBatchesRepository) {}

  execute(input: {
    branchCode: string;
    priceListName: string;
    customerId?: string;
    customerName?: string;
    customerReference?: string;
    amountPaid?: number;
    commercialAdjustmentPct?: number;
    installationAmount?: number;
    lines: LineInput[];
    createdByEmail: string;
  }) {
    return this.quoteBatchesRepo.create(input);
  }
}
