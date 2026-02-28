import type { PriceListItemRepositoryPort } from "../ports/price-list-item-repository.port";

export interface AddPriceListItemInput {
  priceListId: string;
  skuCode: string;
  basePrice: number;
  discountPct: number;
}

export class AddPriceListItemUseCase {
  constructor(private readonly itemRepo: PriceListItemRepositoryPort) {}

  async execute(input: AddPriceListItemInput): Promise<{ id: string }> {
    // Validate: basePrice > 0
    if (input.basePrice <= 0) {
      throw new Error("El precio base debe ser mayor a 0");
    }

    // Validate: discountPct between 0 and 100
    if (input.discountPct < 0 || input.discountPct > 100) {
      throw new Error("El descuento debe estar entre 0 y 100");
    }

    const result = await this.itemRepo.create({
      priceListId: input.priceListId,
      skuCode: input.skuCode,
      basePrice: input.basePrice,
      discountPct: input.discountPct
    });

    return { id: result.id };
  }
}
