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
export class UpdateQuoteBatchUseCase {
  constructor(private readonly quoteBatchesRepo: PrismaQuoteBatchesRepository) {}

  execute(
    id: string,
    actorEmail: string,
    input: {
      customerId?: string | null;
      customerName?: string;
      customerReference?: string;
      amountPaid?: number;
      commercialAdjustmentPct?: number;
      installationAmount?: number;
      lines?: LineInput[];
    }
  ) {
    return this.quoteBatchesRepo.update(id, actorEmail, input);
  }
}
