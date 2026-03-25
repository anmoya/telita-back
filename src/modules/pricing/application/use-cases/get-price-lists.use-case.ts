import { Inject, Injectable } from "@nestjs/common";
import { PRICE_LIST_REPOSITORY, type PriceListRepositoryPort } from "../ports/price-list-repository.port";

@Injectable()
export class GetPriceListsUseCase {
  constructor(
    @Inject(PRICE_LIST_REPOSITORY)
    private readonly priceListRepo: PriceListRepositoryPort
  ) {}

  async execute(branchCode: string) {
    return this.priceListRepo.getByBranchCode(branchCode);
  }
}
