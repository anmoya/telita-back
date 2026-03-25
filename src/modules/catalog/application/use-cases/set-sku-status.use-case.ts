import { Injectable } from "@nestjs/common";
import { PrismaCatalogRepository } from "../../infrastructure/persistence/prisma/prisma-catalog.repository";

@Injectable()
export class SetSkuStatusUseCase {
  constructor(private readonly catalogRepo: PrismaCatalogRepository) {}

  execute(id: string, isActive: boolean, actorUserId: string) {
    return this.catalogRepo.setSkuStatus(id, isActive, actorUserId);
  }
}
