import { Inject, Injectable } from "@nestjs/common";
import { PRICE_CELL_REPOSITORY, type PriceCellRepositoryPort } from "../ports/price-repository.port";

@Injectable()
export class ListPriceListCellsUseCase {
  constructor(
    @Inject(PRICE_CELL_REPOSITORY)
    private readonly priceRepo: PriceCellRepositoryPort
  ) {}

  execute(priceListId: string, skuId?: string) {
    return this.priceRepo.listCells(priceListId, skuId);
  }
}
