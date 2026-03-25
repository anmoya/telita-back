import { Injectable } from "@nestjs/common";
import { type SoftHoldPolicy, PrismaSettingsRepository } from "../../infrastructure/persistence/prisma/prisma-settings.repository";

@Injectable()
export class UpdateSoftHoldPolicyUseCase {
  constructor(private readonly settingsRepo: PrismaSettingsRepository) {}

  execute(input: Partial<SoftHoldPolicy>, actorEmail: string) {
    return this.settingsRepo.updateSoftHoldPolicy(input, actorEmail);
  }
}
