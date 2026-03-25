import { Inject, Injectable } from "@nestjs/common";
import { AppValidationError } from "../../../../shared/application/errors/app-error";
import { PRICE_LIST_REPOSITORY, type PriceListRepositoryPort } from "../ports/price-list-repository.port";

export interface UpdatePriceListInput {
  id: string;
  name?: string;
  validFrom?: string;
  validTo?: string | null;
}

@Injectable()
export class UpdatePriceListUseCase {
  constructor(
    @Inject(PRICE_LIST_REPOSITORY)
    private readonly priceListRepo: PriceListRepositoryPort
  ) {}

  async execute(input: UpdatePriceListInput): Promise<void> {
    const updateData: { name?: string; validFrom?: Date; validTo?: Date | null } = {};

    if (input.name !== undefined) {
      if (input.name.trim().length === 0) {
        throw new AppValidationError("El nombre no puede estar vacío");
      }
      updateData.name = input.name.trim();
    }

    if (input.validFrom !== undefined) {
      updateData.validFrom = new Date(input.validFrom);
    }

    if (input.validTo !== undefined) {
      updateData.validTo = input.validTo ? new Date(input.validTo) : null;
    }

    await this.priceListRepo.update(input.id, updateData);
  }
}
