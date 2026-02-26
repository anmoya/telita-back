import type { PriceListRepositoryPort } from "../ports/price-list-repository.port";

export class TogglePriceListStatusUseCase {
  constructor(private readonly priceListRepo: PriceListRepositoryPort) {}

  async execute(id: string): Promise<{ isActive: boolean }> {
    // Check if deactivating and has DRAFT sales
    const hasActiveDraftSales = await this.priceListRepo.hasActiveSales(id);
    
    if (hasActiveDraftSales) {
      throw new Error("Cannot deactivate price list with active DRAFT sales");
    }

    const newStatus = await this.priceListRepo.toggleStatus(id);
    return { isActive: newStatus };
  }
}
