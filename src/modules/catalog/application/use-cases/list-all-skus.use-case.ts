import { Injectable } from "@nestjs/common";
import { PrismaCatalogRepository } from "../../infrastructure/persistence/prisma/prisma-catalog.repository";

@Injectable()
export class ListAllSkusUseCase {
  constructor(private readonly catalogRepo: PrismaCatalogRepository) {}

  execute(branchCode: string) {
    return this.catalogRepo.listAllSkus(branchCode);
  }
}
