import { Injectable } from "@nestjs/common";
import { type CutScrapLookupPolicy, PrismaSettingsRepository } from "../../infrastructure/persistence/prisma/prisma-settings.repository";

@Injectable()
export class UpdateCutScrapLookupPolicyUseCase {
  constructor(private readonly settingsRepo: PrismaSettingsRepository) {}

  execute(input: Partial<CutScrapLookupPolicy>, actorEmail: string) {
    return this.settingsRepo.updateCutScrapLookupPolicy(input, actorEmail);
  }
}
