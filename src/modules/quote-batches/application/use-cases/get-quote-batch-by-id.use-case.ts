import { Injectable } from "@nestjs/common";
import { PrismaQuoteBatchesRepository } from "../../infrastructure/persistence/prisma/prisma-quote-batches.repository";

@Injectable()
export class GetQuoteBatchByIdUseCase {
  constructor(private readonly quoteBatchesRepo: PrismaQuoteBatchesRepository) {}

  execute(id: string) {
    return this.quoteBatchesRepo.findById(id);
  }
}
