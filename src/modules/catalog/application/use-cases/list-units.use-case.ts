import { Injectable } from "@nestjs/common";
import { PrismaCatalogRepository } from "../../infrastructure/persistence/prisma/prisma-catalog.repository";

@Injectable()
export class ListUnitsUseCase {
  constructor(private readonly catalogRepo: PrismaCatalogRepository) {}

  execute() {
    return this.catalogRepo.listUnits();
  }
}
