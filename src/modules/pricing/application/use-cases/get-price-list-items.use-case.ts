import type { PriceListItemRepositoryPort } from "../ports/price-list-item-repository.port";

export class GetPriceListItemsUseCase {
  constructor(private readonly itemRepo: PriceListItemRepositoryPort) {}

  async execute(priceListId: string) {
    return this.itemRepo.getByPriceListId(priceListId);
  }
}
