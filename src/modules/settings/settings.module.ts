import { Module } from "@nestjs/common";
import { GetCutScrapLookupPolicyUseCase } from "./application/use-cases/get-cut-scrap-lookup-policy.use-case";
import { GetCutSheetPolicyUseCase } from "./application/use-cases/get-cut-sheet-policy.use-case";
import { GetFlowRulesUseCase } from "./application/use-cases/get-flow-rules.use-case";
import { GetScrapPolicyUseCase } from "./application/use-cases/get-scrap-policy.use-case";
import { GetSoftHoldPolicyUseCase } from "./application/use-cases/get-soft-hold-policy.use-case";
import { UpdateCutScrapLookupPolicyUseCase } from "./application/use-cases/update-cut-scrap-lookup-policy.use-case";
import { UpdateCutSheetPolicyUseCase } from "./application/use-cases/update-cut-sheet-policy.use-case";
import { UpdateFlowRulesUseCase } from "./application/use-cases/update-flow-rules.use-case";
import { UpdateScrapPolicyUseCase } from "./application/use-cases/update-scrap-policy.use-case";
import { UpdateSoftHoldPolicyUseCase } from "./application/use-cases/update-soft-hold-policy.use-case";
import { PrismaSettingsRepository } from "./infrastructure/persistence/prisma/prisma-settings.repository";
import { SettingsController } from "./presentation/controllers/settings.controller";

@Module({
  controllers: [SettingsController],
  providers: [
    PrismaSettingsRepository,
    GetScrapPolicyUseCase,
    UpdateScrapPolicyUseCase,
    GetCutScrapLookupPolicyUseCase,
    UpdateCutScrapLookupPolicyUseCase,
    GetFlowRulesUseCase,
    UpdateFlowRulesUseCase,
    GetSoftHoldPolicyUseCase,
    UpdateSoftHoldPolicyUseCase,
    GetCutSheetPolicyUseCase,
    UpdateCutSheetPolicyUseCase
  ]
})
export class SettingsModule {}
