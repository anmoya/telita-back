import { Inject, Injectable } from "@nestjs/common";
import { AppConflictError } from "../../../../shared/application/errors/app-error";
import { PRICE_LIST_REPOSITORY, type PriceListRepositoryPort } from "../ports/price-list-repository.port";

@Injectable()
export class TogglePriceListStatusUseCase {
  constructor(
    @Inject(PRICE_LIST_REPOSITORY)
    private readonly priceListRepo: PriceListRepositoryPort
  ) {}

  async execute(id: string): Promise<{ isActive: boolean }> {
    // Check if deactivating and has DRAFT sales
    const hasActiveDraftSales = await this.priceListRepo.hasActiveSales(id);
    
    if (hasActiveDraftSales) {
      throw new AppConflictError("No se puede desactivar una lista de precios con ventas DRAFT activas");
    }

    const newStatus = await this.priceListRepo.toggleStatus(id);
    return { isActive: newStatus };
  }
}
