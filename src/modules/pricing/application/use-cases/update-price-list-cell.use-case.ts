import { Inject, Injectable } from "@nestjs/common";
import { PRICE_CELL_REPOSITORY, type PriceCellRepositoryPort } from "../ports/price-repository.port";

@Injectable()
export class UpdatePriceListCellUseCase {
  constructor(
    @Inject(PRICE_CELL_REPOSITORY)
    private readonly priceRepo: PriceCellRepositoryPort
  ) {}

  execute(
    cellId: string,
    input: Partial<{
      maxWidthM: number;
      maxHeightM: number;
      unitPrice: number;
    }>
  ) {
    return this.priceRepo.updateCell(cellId, input);
  }
}
