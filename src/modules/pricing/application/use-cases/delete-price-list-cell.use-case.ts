import { Inject, Injectable } from "@nestjs/common";
import { PRICE_CELL_REPOSITORY, type PriceCellRepositoryPort } from "../ports/price-repository.port";

@Injectable()
export class DeletePriceListCellUseCase {
  constructor(
    @Inject(PRICE_CELL_REPOSITORY)
    private readonly priceRepo: PriceCellRepositoryPort
  ) {}

  execute(cellId: string) {
    return this.priceRepo.deleteCell(cellId);
  }
}
