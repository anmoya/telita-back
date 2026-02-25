import { BadRequestException, Body, Controller, Get, Headers, Put } from "@nestjs/common";
import {
  PrismaSettingsRepository,
  ScrapRequiredAtStage
} from "../../infrastructure/persistence/prisma/prisma-settings.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

const VALID_STAGES: ScrapRequiredAtStage[] = ["NONE", "AT_CUT", "AT_SALE_CLOSE"];

@Controller("settings")
export class SettingsController {
  private readonly repo = new PrismaSettingsRepository();

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
}
