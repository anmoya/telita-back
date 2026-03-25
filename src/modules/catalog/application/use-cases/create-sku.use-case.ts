import { Injectable } from "@nestjs/common";
import { PrismaCatalogRepository, type CreateSkuInput } from "../../infrastructure/persistence/prisma/prisma-catalog.repository";

@Injectable()
export class CreateSkuUseCase {
  constructor(private readonly catalogRepo: PrismaCatalogRepository) {}

  execute(input: CreateSkuInput, actorUserId: string) {
    return this.catalogRepo.createSku(input, actorUserId);
  }
}
