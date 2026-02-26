import type { PriceListRepositoryPort } from "../ports/price-list-repository.port";

export class GetPriceListsUseCase {
  constructor(private readonly priceListRepo: PriceListRepositoryPort) {}

  async execute(branchCode: string) {
    return this.priceListRepo.getByBranchCode(branchCode);
  }
}
