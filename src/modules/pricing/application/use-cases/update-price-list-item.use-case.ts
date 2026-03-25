import { Inject, Injectable } from "@nestjs/common";
import { AppValidationError } from "../../../../shared/application/errors/app-error";
import { PRICE_LIST_ITEM_REPOSITORY, type PriceListItemRepositoryPort } from "../ports/price-list-item-repository.port";

export interface UpdatePriceListItemInput {
  id: string;
  basePrice?: number;
  discountPct?: number;
}

@Injectable()
export class UpdatePriceListItemUseCase {
  constructor(
    @Inject(PRICE_LIST_ITEM_REPOSITORY)
    private readonly itemRepo: PriceListItemRepositoryPort
  ) {}

  async execute(input: UpdatePriceListItemInput): Promise<void> {
    // Validate: basePrice > 0 if provided
    if (input.basePrice !== undefined && input.basePrice <= 0) {
      throw new AppValidationError("El precio base debe ser mayor a 0");
    }

    // Validate: discountPct between 0 and 100 if provided
    if (input.discountPct !== undefined && (input.discountPct < 0 || input.discountPct > 100)) {
      throw new AppValidationError("El descuento debe estar entre 0 y 100");
    }

    const updateData: { basePrice?: number; discountPct?: number } = {};
    if (input.basePrice !== undefined) updateData.basePrice = input.basePrice;
    if (input.discountPct !== undefined) updateData.discountPct = input.discountPct;

    await this.itemRepo.update(input.id, updateData);
  }
}
