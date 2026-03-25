import { Injectable } from "@nestjs/common";
import { PrismaQuoteBatchesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-batches.repository";

@Injectable()
export class DuplicateQuoteBatchUseCase {
  constructor(private readonly quoteBatchesRepo: PrismaQuoteBatchesRepository) {}

  execute(id: string, actorEmail: string) {
    return this.quoteBatchesRepo.duplicate(id, actorEmail);
  }
}
