import { Inject, Injectable } from "@nestjs/common";
import { QUOTE_REPOSITORY, type QuoteRepositoryPort } from "../ports/price-repository.port";

@Injectable()
export class ListQuotesUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly priceRepo: QuoteRepositoryPort
  ) {}

  execute(branchCode: string) {
    return this.priceRepo.listQuotes(branchCode);
  }
}
