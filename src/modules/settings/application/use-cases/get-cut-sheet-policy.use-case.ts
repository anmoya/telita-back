import { Injectable } from "@nestjs/common";
import { PrismaSettingsRepository } from "../../infrastructure/persistence/prisma/prisma-settings.repository";

@Injectable()
export class GetCutSheetPolicyUseCase {
  constructor(private readonly settingsRepo: PrismaSettingsRepository) {}

  execute() {
    return this.settingsRepo.getCutSheetPolicy();
  }
}
