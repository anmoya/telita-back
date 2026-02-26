import type { PriceListItemRepositoryPort } from "../ports/price-list-item-repository.port";

export class DeletePriceListItemUseCase {
  constructor(private readonly itemRepo: PriceListItemRepositoryPort) {}

  async execute(id: string): Promise<void> {
    await this.itemRepo.delete(id);
  }
}
