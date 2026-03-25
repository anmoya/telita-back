import { Injectable } from "@nestjs/common";
import type { ScrapPolicy } from "../../../scraps/domain/scrap-policy";
import { PrismaSettingsRepository } from "../../infrastructure/persistence/prisma/prisma-settings.repository";

@Injectable()
export class UpdateScrapPolicyUseCase {
  constructor(private readonly settingsRepo: PrismaSettingsRepository) {}

  execute(policy: ScrapPolicy, actorEmail: string) {
    return this.settingsRepo.updateScrapPolicy(policy, actorEmail);
  }
}
