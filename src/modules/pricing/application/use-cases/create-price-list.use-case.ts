import type { PriceListRepositoryPort } from "../ports/price-list-repository.port";

export interface CreatePriceListInput {
  branchCode: string;
  name: string;
  currencyCode: string;
  validFrom: string;
  validTo?: string | null;
}

export interface CreatePriceListOutput {
  id: string;
}

export class CreatePriceListUseCase {
  constructor(private readonly priceListRepo: PriceListRepositoryPort) {}

  async execute(input: CreatePriceListInput): Promise<CreatePriceListOutput> {
    // Validate: name required, unique per branch (handled by DB)
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Name is required");
    }

    // Validate: basePrice > 0 handled in items
    // Validate: currencyCode should exist (handled by FK)

    const result = await this.priceListRepo.create({
      branchCode: input.branchCode,
      name: input.name.trim(),
      currencyCode: input.currencyCode,
      validFrom: new Date(input.validFrom),
      validTo: input.validTo ? new Date(input.validTo) : null
    });

    return { id: result.id };
  }
}
