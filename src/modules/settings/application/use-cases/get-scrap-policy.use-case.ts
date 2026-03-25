import { Injectable } from "@nestjs/common";
import { PrismaSettingsRepository } from "../../infrastructure/persistence/prisma/prisma-settings.repository";

@Injectable()
export class GetScrapPolicyUseCase {
  constructor(private readonly settingsRepo: PrismaSettingsRepository) {}

  execute() {
    return this.settingsRepo.getScrapPolicy();
  }
}
