import { AuditAction } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";
import {
  DEFAULT_SCRAP_POLICY,
  type ScrapLocationPolicy,
  type ScrapPolicy,
  buildMinWidthPolicy,
  parseScrapPolicy
} from "../../../../scraps/domain/scrap-policy";

const SCRAP_POLICY_KEY = "scrap_policy";
const FLOW_RULES_KEY = "flow_rules";
const SCRAP_POLICY_AUDIT_ID = "00000000-0000-0000-0000-000000000010";
const FLOW_RULES_AUDIT_ID = "00000000-0000-0000-0000-000000000001";

export type ScrapRequiredAtStage = "NONE" | "AT_CUT" | "AT_SALE_CLOSE";

export type FlowRules = {
  scrapRequiredAtStage: ScrapRequiredAtStage;
};

const DEFAULT_FLOW_RULES: FlowRules = { scrapRequiredAtStage: "AT_CUT" };

export class PrismaSettingsRepository {
  private readonly auditRepo = new PrismaAuditRepository();

  async getScrapPolicy(): Promise<ScrapPolicy> {
    const setting = await prismaClient.systemSetting.findUnique({ where: { key: SCRAP_POLICY_KEY } });
    if (setting) {
      return parseScrapPolicy(setting.valueJson);
    }
    return this.getLegacyDefaultScrapPolicy();
  }

  async updateScrapPolicy(policy: ScrapPolicy, updatedByEmail: string): Promise<ScrapPolicy> {
    const user = await prismaClient.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const existing = await prismaClient.systemSetting.findUnique({ where: { key: SCRAP_POLICY_KEY } });
    const normalized = parseScrapPolicy(policy);

    await prismaClient.systemSetting.upsert({
      where: { key: SCRAP_POLICY_KEY },
      update: { valueJson: normalized, updatedBy: user.id, updatedAt: new Date() },
      create: { key: SCRAP_POLICY_KEY, valueJson: normalized, updatedBy: user.id, updatedAt: new Date() }
    });

    await this.auditRepo.log({
      actorUserId: user.id,
      entityType: "system_setting",
      entityId: SCRAP_POLICY_AUDIT_ID,
      action: AuditAction.UPDATE,
      beforeJson: existing ? (existing.valueJson as object) : null,
      afterJson: normalized
    });

    return normalized;
  }

  async getFlowRules(): Promise<FlowRules> {
    const policy = await this.getScrapPolicy();
    const scrapRequiredAtStage: ScrapRequiredAtStage =
      policy.locationPolicy === "AT_CUT_REQUIRE_LOCATION" ? "AT_CUT" : "NONE";
    return { scrapRequiredAtStage };
  }

  async updateFlowRules(rules: FlowRules, updatedByEmail: string): Promise<FlowRules> {
    const user = await prismaClient.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const existing = await prismaClient.systemSetting.findUnique({ where: { key: FLOW_RULES_KEY } });
    await prismaClient.systemSetting.upsert({
      where: { key: FLOW_RULES_KEY },
      update: { valueJson: rules, updatedBy: user.id, updatedAt: new Date() },
      create: { key: FLOW_RULES_KEY, valueJson: rules, updatedBy: user.id, updatedAt: new Date() }
    });
    await this.auditRepo.log({
      actorUserId: user.id,
      entityType: "system_setting",
      entityId: FLOW_RULES_AUDIT_ID,
      action: AuditAction.UPDATE,
      beforeJson: existing ? (existing.valueJson as object) : null,
      afterJson: rules
    });

    const locationPolicy: ScrapLocationPolicy =
      rules.scrapRequiredAtStage === "AT_CUT" ? "AT_CUT_REQUIRE_LOCATION" : "AT_CUT_ROUTE_TO_INBOUND";
    await this.updateScrapPolicy(buildMinWidthPolicy(50, locationPolicy), updatedByEmail);
    return rules;
  }

  private async getLegacyDefaultScrapPolicy(): Promise<ScrapPolicy> {
    const widthThreshold = await this.resolveLegacyWidthThresholdCm();
    const legacyFlowRules = await prismaClient.systemSetting.findUnique({ where: { key: FLOW_RULES_KEY } });
    const parsedFlowRules = (legacyFlowRules?.valueJson ?? DEFAULT_FLOW_RULES) as Record<string, unknown>;
    const scrapRequiredAtStage = parsedFlowRules.scrapRequiredAtStage as ScrapRequiredAtStage | undefined;
    const locationPolicy: ScrapLocationPolicy =
      scrapRequiredAtStage === "AT_CUT" ? "AT_CUT_REQUIRE_LOCATION" : DEFAULT_SCRAP_POLICY.locationPolicy;
    return buildMinWidthPolicy(widthThreshold, locationPolicy);
  }

  private async resolveLegacyWidthThresholdCm(): Promise<number> {
    const explicit = await prismaClient.systemSetting.findUnique({ where: { key: "global_scrap_threshold_m2" } });
    const value = Number(explicit?.valueJson ?? 0);
    if (Number.isFinite(value) && value > 0) {
      const widthThresholdM = Math.sqrt(value);
      return Number((widthThresholdM * 100).toFixed(2));
    }
    return 50;
  }
}
