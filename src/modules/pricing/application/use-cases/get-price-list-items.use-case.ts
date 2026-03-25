import { Inject, Injectable } from "@nestjs/common";
import { PRICE_LIST_ITEM_REPOSITORY, type PriceListItemRepositoryPort } from "../ports/price-list-item-repository.port";

@Injectable()
export class GetPriceListItemsUseCase {
  constructor(
    @Inject(PRICE_LIST_ITEM_REPOSITORY)
    private readonly itemRepo: PriceListItemRepositoryPort
  ) {}

  async execute(priceListId: string) {
    return this.itemRepo.getByPriceListId(priceListId);
  }
}
