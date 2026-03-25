import { Inject, Injectable } from "@nestjs/common";
import { PRICE_CELL_REPOSITORY, type PriceCellRepositoryPort } from "../ports/price-repository.port";

@Injectable()
export class CreatePriceListCellUseCase {
  constructor(
    @Inject(PRICE_CELL_REPOSITORY)
    private readonly priceRepo: PriceCellRepositoryPort
  ) {}

  execute(input: {
    priceListId: string;
    skuCode: string;
    maxWidthM: number;
    maxHeightM: number;
    unitPrice: number;
  }) {
    return this.priceRepo.createCellBySkuCode(input);
  }
}
