import { Injectable } from "@nestjs/common";
import { PrismaQuoteBatchesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-batches.repository";

@Injectable()
export class FinalizeQuoteBatchUseCase {
  constructor(private readonly quoteBatchesRepo: PrismaQuoteBatchesRepository) {}

  execute(id: string, actorEmail: string) {
    return this.quoteBatchesRepo.finalize(id, actorEmail);
  }
}
