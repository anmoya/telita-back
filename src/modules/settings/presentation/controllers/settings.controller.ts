import { BadRequestException, Body, Controller, Get, Headers, Put } from "@nestjs/common";
import {
  PrismaSettingsRepository,
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
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

const VALID_STAGES: ScrapRequiredAtStage[] = ["NONE", "AT_CUT", "AT_SALE_CLOSE"];
const VALID_LOCATION_POLICIES: ScrapLocationPolicy[] = ["AT_CUT_REQUIRE_LOCATION", "AT_CUT_ROUTE_TO_INBOUND"];

@Controller("settings")
export class SettingsController {
  private readonly repo = new PrismaSettingsRepository();

  @Get("scrap-policy")
  async getScrapPolicy(@Headers("authorization") authorization?: string) {
    requireAuth(authorization);
    const policy = await this.repo.getScrapPolicy();
    return {
      ...policy,
      minWidthCm: extractMinWidthThresholdCm(policy)
    };
  }

  @Put("scrap-policy")
  async updateScrapPolicy(
    @Body()
    body: {
      classificationRule?: unknown;
      locationPolicy?: ScrapLocationPolicy;
      minWidthCm?: number;
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      const policy =
        typeof body.minWidthCm === "number"
          ? buildMinWidthPolicy(body.minWidthCm, normalizeLocationPolicy(body.locationPolicy))
          : parseScrapPolicy({
              classificationRule: body.classificationRule,
              locationPolicy: normalizeLocationPolicy(body.locationPolicy)
            });
      const saved = await this.repo.updateScrapPolicy(policy, auth.email);
      return {
        ...saved,
        minWidthCm: extractMinWidthThresholdCm(saved)
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("cut-scrap-lookup-policy")
  async getCutScrapLookupPolicy(@Headers("authorization") authorization?: string) {
    requireAuth(authorization);
    return this.repo.getCutScrapLookupPolicy();
  }

  @Put("cut-scrap-lookup-policy")
  async updateCutScrapLookupPolicy(
    @Body() body: Partial<CutScrapLookupPolicy>,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return await this.repo.updateCutScrapLookupPolicy(body, auth.email);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("flow-rules")
  async getFlowRules(@Headers("authorization") authorization?: string) {
    requireAuth(authorization);
    return this.repo.getFlowRules();
  }

  @Put("flow-rules")
  async updateFlowRules(
    @Body() body: { scrapRequiredAtStage: ScrapRequiredAtStage },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    if (!VALID_STAGES.includes(body.scrapRequiredAtStage)) {
      throw new BadRequestException(`scrapRequiredAtStage must be one of: ${VALID_STAGES.join(", ")}.`);
    }
    try {
      return await this.repo.updateFlowRules({ scrapRequiredAtStage: body.scrapRequiredAtStage }, auth.email);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unexpected error");
    }
  }

  @Get("scrap-soft-hold-policy")
  async getSoftHoldPolicy(@Headers("authorization") authorization?: string) {
    requireAuth(authorization);
    return this.repo.getSoftHoldPolicy();
  }

  @Put("scrap-soft-hold-policy")
  async updateSoftHoldPolicy(
    @Body() body: Partial<SoftHoldPolicy>,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return await this.repo.updateSoftHoldPolicy(body, auth.email);
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
