import { Injectable } from "@nestjs/common";
import { PrismaCatalogRepository, type UpdateSkuInput } from "../../infrastructure/persistence/prisma/prisma-catalog.repository";

@Injectable()
export class UpdateSkuUseCase {
  constructor(private readonly catalogRepo: PrismaCatalogRepository) {}

  execute(id: string, input: UpdateSkuInput, actorUserId: string) {
    return this.catalogRepo.updateSku(id, input, actorUserId);
  }
}
