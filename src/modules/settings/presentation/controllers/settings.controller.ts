import { BadRequestException, Body, Controller, Get, Put } from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { Roles } from "../../../../shared/presentation/roles.decorator";
import { GetCutScrapLookupPolicyUseCase } from "../../application/use-cases/get-cut-scrap-lookup-policy.use-case";
import { GetCutSheetPolicyUseCase } from "../../application/use-cases/get-cut-sheet-policy.use-case";
import { GetFlowRulesUseCase } from "../../application/use-cases/get-flow-rules.use-case";
import { GetScrapPolicyUseCase } from "../../application/use-cases/get-scrap-policy.use-case";
import { GetSoftHoldPolicyUseCase } from "../../application/use-cases/get-soft-hold-policy.use-case";
import { UpdateCutScrapLookupPolicyUseCase } from "../../application/use-cases/update-cut-scrap-lookup-policy.use-case";
import { UpdateCutSheetPolicyUseCase } from "../../application/use-cases/update-cut-sheet-policy.use-case";
import { UpdateFlowRulesUseCase } from "../../application/use-cases/update-flow-rules.use-case";
import { UpdateScrapPolicyUseCase } from "../../application/use-cases/update-scrap-policy.use-case";
import { UpdateSoftHoldPolicyUseCase } from "../../application/use-cases/update-soft-hold-policy.use-case";
import {
  type CutSheetPolicy,
  ScrapRequiredAtStage,
  type CutScrapLookupPolicy,
  type SoftHoldPolicy
} from "../../infrastructure/persistence/prisma/prisma-settings.repository";

import {
  buildMinWidthPolicy,
  extractMinWidthThresholdCm,
  parseScrapPolicy,
  type ScrapLocationPolicy
} from "../../../scraps/domain/scrap-policy";

const VALID_STAGES: ScrapRequiredAtStage[] = ["NONE", "AT_CUT", "AT_SALE_CLOSE"];
const VALID_LOCATION_POLICIES: ScrapLocationPolicy[] = ["AT_CUT_REQUIRE_LOCATION", "AT_CUT_ROUTE_TO_INBOUND"];

@Authenticated()
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly getScrapPolicyUseCase: GetScrapPolicyUseCase,
    private readonly updateScrapPolicyUseCase: UpdateScrapPolicyUseCase,
    private readonly getCutScrapLookupPolicyUseCase: GetCutScrapLookupPolicyUseCase,
    private readonly updateCutScrapLookupPolicyUseCase: UpdateCutScrapLookupPolicyUseCase,
    private readonly getFlowRulesUseCase: GetFlowRulesUseCase,
    private readonly updateFlowRulesUseCase: UpdateFlowRulesUseCase,
    private readonly getSoftHoldPolicyUseCase: GetSoftHoldPolicyUseCase,
    private readonly updateSoftHoldPolicyUseCase: UpdateSoftHoldPolicyUseCase,
    private readonly getCutSheetPolicyUseCase: GetCutSheetPolicyUseCase,
    private readonly updateCutSheetPolicyUseCase: UpdateCutSheetPolicyUseCase
  ) {}

  @Get("scrap-policy")
  async getScrapPolicy() {
    const policy = await this.getScrapPolicyUseCase.execute();
    return {
      ...policy,
      minWidthCm: extractMinWidthThresholdCm(policy)
    };
  }

  @Put("scrap-policy")
  @Roles("superadmin", "admin")
  async updateScrapPolicy(
    @Body()
    body: {
      classificationRule?: unknown;
      locationPolicy?: ScrapLocationPolicy;
      minWidthCm?: number;
    },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      const policy =
        typeof body.minWidthCm === "number"
          ? buildMinWidthPolicy(body.minWidthCm, normalizeLocationPolicy(body.locationPolicy))
          : parseScrapPolicy({
              classificationRule: body.classificationRule,
              locationPolicy: normalizeLocationPolicy(body.locationPolicy)
            });
      const saved = await this.updateScrapPolicyUseCase.execute(policy, auth.email);
      return {
        ...saved,
        minWidthCm: extractMinWidthThresholdCm(saved)
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("cut-scrap-lookup-policy")
  async getCutScrapLookupPolicy() {
    return this.getCutScrapLookupPolicyUseCase.execute();
  }

  @Put("cut-scrap-lookup-policy")
  @Roles("superadmin", "admin")
  async updateCutScrapLookupPolicy(
    @Body() body: Partial<CutScrapLookupPolicy>,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      return await this.updateCutScrapLookupPolicyUseCase.execute(body, auth.email);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("flow-rules")
  async getFlowRules() {
    return this.getFlowRulesUseCase.execute();
  }

  @Put("flow-rules")
  @Roles("superadmin", "admin")
  async updateFlowRules(
    @Body() body: { scrapRequiredAtStage: ScrapRequiredAtStage },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    if (!VALID_STAGES.includes(body.scrapRequiredAtStage)) {
      throw new BadRequestException(`scrapRequiredAtStage must be one of: ${VALID_STAGES.join(", ")}.`);
    }
    try {
      return await this.updateFlowRulesUseCase.execute({ scrapRequiredAtStage: body.scrapRequiredAtStage }, auth.email);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("scrap-soft-hold-policy")
  async getSoftHoldPolicy() {
    return this.getSoftHoldPolicyUseCase.execute();
  }

  @Put("scrap-soft-hold-policy")
  @Roles("superadmin", "admin")
  async updateSoftHoldPolicy(
    @Body() body: Partial<SoftHoldPolicy>,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      return await this.updateSoftHoldPolicyUseCase.execute(body, auth.email);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("cut-sheet-policy")
  async getCutSheetPolicy() {
    return this.getCutSheetPolicyUseCase.execute();
  }

  @Put("cut-sheet-policy")
  @Roles("superadmin", "admin")
  async updateCutSheetPolicy(
    @Body() body: Partial<CutSheetPolicy>,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    try {
      return await this.updateCutSheetPolicyUseCase.execute(body, auth.email);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }
}

function normalizeLocationPolicy(input?: ScrapLocationPolicy): ScrapLocationPolicy {
  if (!input) return "AT_CUT_REQUIRE_LOCATION";
  if (!VALID_LOCATION_POLICIES.includes(input)) {
    throw new BadRequestException(`locationPolicy must be one of: ${VALID_LOCATION_POLICIES.join(", ")}.`);
  }
  return input;
}
