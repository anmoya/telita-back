import { Injectable } from "@nestjs/common";
import { PrismaSettingsRepository, type ScrapRequiredAtStage } from "../../infrastructure/persistence/prisma/prisma-settings.repository";

@Injectable()
export class UpdateFlowRulesUseCase {
  constructor(private readonly settingsRepo: PrismaSettingsRepository) {}

  execute(input: { scrapRequiredAtStage: ScrapRequiredAtStage }, actorEmail: string) {
    return this.settingsRepo.updateFlowRules(input, actorEmail);
  }
}
