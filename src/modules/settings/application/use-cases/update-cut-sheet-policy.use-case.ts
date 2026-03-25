import { Injectable } from "@nestjs/common";
import { type CutSheetPolicy, PrismaSettingsRepository } from "../../infrastructure/persistence/prisma/prisma-settings.repository";

@Injectable()
export class UpdateCutSheetPolicyUseCase {
  constructor(private readonly settingsRepo: PrismaSettingsRepository) {}

  execute(input: Partial<CutSheetPolicy>, actorEmail: string) {
    return this.settingsRepo.updateCutSheetPolicy(input, actorEmail);
  }
}
