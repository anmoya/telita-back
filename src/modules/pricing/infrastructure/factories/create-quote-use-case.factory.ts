import { PrismaClient } from "@prisma/client";
import { CalculateQuoteUseCase } from "../../application/use-cases/calculate-quote.use-case";
import { PrismaPriceRepository } from "../persistence/prisma/prisma-price.repository";
import { SystemClockService } from "../../../../shared/infrastructure/time/system-clock.service";

const prisma = new PrismaClient();

export function createQuoteUseCase(): CalculateQuoteUseCase {
  return new CalculateQuoteUseCase(new SystemClockService(), new PrismaPriceRepository(prisma));
}
