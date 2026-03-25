import { Injectable } from "@nestjs/common";
import { PrismaCatalogRepository } from "../../infrastructure/persistence/prisma/prisma-catalog.repository";

@Injectable()
export class ListSkusUseCase {
  constructor(private readonly catalogRepo: PrismaCatalogRepository) {}

  execute(branchCode: string) {
    return this.catalogRepo.listSkus(branchCode);
  }
}
