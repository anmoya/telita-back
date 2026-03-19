import { Injectable } from "@nestjs/common";
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
const CUT_SCRAP_LOOKUP_POLICY_KEY = "cut_scrap_lookup_policy";
const SCRAP_POLICY_AUDIT_ID = "00000000-0000-0000-0000-000000000010";
const FLOW_RULES_AUDIT_ID = "00000000-0000-0000-0000-000000000001";
const CUT_SCRAP_LOOKUP_AUDIT_ID = "00000000-0000-0000-0000-000000000056";
const SOFT_HOLD_POLICY_KEY = "scrap_soft_hold_policy";
const SOFT_HOLD_AUDIT_ID = "00000000-0000-0000-0000-000000000058";

export type CutScrapLookupMode = "OFF" | "MANUAL" | "AUTO_SUGGEST" | "REQUIRE_DECISION";
export type CutScrapLookupScope = "CURRENT_LINE" | "ENTIRE_ORDER";

export type CutScrapLookupPolicy = {
  mode: CutScrapLookupMode;
  scope: CutScrapLookupScope;
  allowManualSearch: boolean;
  maxSuggestionsPerLine: number;
};

const DEFAULT_CUT_SCRAP_LOOKUP_POLICY: CutScrapLookupPolicy = {
  mode: "OFF",
  scope: "CURRENT_LINE",
  allowManualSearch: false,
  maxSuggestionsPerLine: 3
};

const VALID_MODES: CutScrapLookupMode[] = ["OFF", "MANUAL", "AUTO_SUGGEST", "REQUIRE_DECISION"];
const VALID_SCOPES: CutScrapLookupScope[] = ["CURRENT_LINE", "ENTIRE_ORDER"];

export type SoftHoldPolicy = {
  enabled: boolean;
  defaultMinutes: number;
  maxMinutes: number;
};

const DEFAULT_SOFT_HOLD_POLICY: SoftHoldPolicy = {
  enabled: false,
  defaultMinutes: 15,
  maxMinutes: 60
};

export type ScrapRequiredAtStage = "NONE" | "AT_CUT" | "AT_SALE_CLOSE";

export type FlowRules = {
  scrapRequiredAtStage: ScrapRequiredAtStage;
};

const DEFAULT_FLOW_RULES: FlowRules = { scrapRequiredAtStage: "AT_CUT" };

@Injectable()
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

  async getCutScrapLookupPolicy(): Promise<CutScrapLookupPolicy> {
    const setting = await prismaClient.systemSetting.findUnique({ where: { key: CUT_SCRAP_LOOKUP_POLICY_KEY } });
    if (!setting) return DEFAULT_CUT_SCRAP_LOOKUP_POLICY;
    return parseCutScrapLookupPolicy(setting.valueJson);
  }

  async updateCutScrapLookupPolicy(input: Partial<CutScrapLookupPolicy>, updatedByEmail: string): Promise<CutScrapLookupPolicy> {
    const user = await prismaClient.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const current = await this.getCutScrapLookupPolicy();
    const updated = parseCutScrapLookupPolicy({
      mode: input.mode ?? current.mode,
      scope: input.scope ?? current.scope,
      allowManualSearch: input.allowManualSearch ?? current.allowManualSearch,
      maxSuggestionsPerLine: input.maxSuggestionsPerLine ?? current.maxSuggestionsPerLine
    });

    const existing = await prismaClient.systemSetting.findUnique({ where: { key: CUT_SCRAP_LOOKUP_POLICY_KEY } });
    await prismaClient.systemSetting.upsert({
      where: { key: CUT_SCRAP_LOOKUP_POLICY_KEY },
      update: { valueJson: updated, updatedBy: user.id, updatedAt: new Date() },
      create: { key: CUT_SCRAP_LOOKUP_POLICY_KEY, valueJson: updated, updatedBy: user.id, updatedAt: new Date() }
    });

    await this.auditRepo.log({
      actorUserId: user.id,
      entityType: "system_setting",
      entityId: CUT_SCRAP_LOOKUP_AUDIT_ID,
      action: AuditAction.UPDATE,
      beforeJson: existing ? (existing.valueJson as object) : null,
      afterJson: updated
    });

    return updated;
  }

  async getSoftHoldPolicy(): Promise<SoftHoldPolicy> {
    const setting = await prismaClient.systemSetting.findUnique({ where: { key: SOFT_HOLD_POLICY_KEY } });
    if (!setting) return DEFAULT_SOFT_HOLD_POLICY;
    return parseSoftHoldPolicy(setting.valueJson);
  }

  async updateSoftHoldPolicy(input: Partial<SoftHoldPolicy>, updatedByEmail: string): Promise<SoftHoldPolicy> {
    const user = await prismaClient.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const current = await this.getSoftHoldPolicy();
    const updated = parseSoftHoldPolicy({
      enabled: input.enabled ?? current.enabled,
      defaultMinutes: input.defaultMinutes ?? current.defaultMinutes,
      maxMinutes: input.maxMinutes ?? current.maxMinutes
    });

    const existing = await prismaClient.systemSetting.findUnique({ where: { key: SOFT_HOLD_POLICY_KEY } });
    await prismaClient.systemSetting.upsert({
      where: { key: SOFT_HOLD_POLICY_KEY },
      update: { valueJson: updated, updatedBy: user.id, updatedAt: new Date() },
      create: { key: SOFT_HOLD_POLICY_KEY, valueJson: updated, updatedBy: user.id, updatedAt: new Date() }
    });

    await this.auditRepo.log({
      actorUserId: user.id,
      entityType: "system_setting",
      entityId: SOFT_HOLD_AUDIT_ID,
      action: AuditAction.UPDATE,
      beforeJson: existing ? (existing.valueJson as object) : null,
      afterJson: updated
    });

    return updated;
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

function parseCutScrapLookupPolicy(raw: unknown): CutScrapLookupPolicy {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const mode = VALID_MODES.includes(obj.mode as CutScrapLookupMode)
    ? (obj.mode as CutScrapLookupMode)
    : DEFAULT_CUT_SCRAP_LOOKUP_POLICY.mode;
  const scope = VALID_SCOPES.includes(obj.scope as CutScrapLookupScope)
    ? (obj.scope as CutScrapLookupScope)
    : DEFAULT_CUT_SCRAP_LOOKUP_POLICY.scope;
  const allowManualSearch = typeof obj.allowManualSearch === "boolean"
    ? obj.allowManualSearch
    : DEFAULT_CUT_SCRAP_LOOKUP_POLICY.allowManualSearch;
  const maxRaw = typeof obj.maxSuggestionsPerLine === "number" ? obj.maxSuggestionsPerLine : 3;
  const maxSuggestionsPerLine = Math.max(1, Math.min(10, maxRaw));
  return { mode, scope, allowManualSearch, maxSuggestionsPerLine };
}

function parseSoftHoldPolicy(raw: unknown): SoftHoldPolicy {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const enabled = typeof obj.enabled === "boolean" ? obj.enabled : DEFAULT_SOFT_HOLD_POLICY.enabled;
  const defaultMinutesRaw = typeof obj.defaultMinutes === "number" ? obj.defaultMinutes : 15;
  const maxMinutesRaw = typeof obj.maxMinutes === "number" ? obj.maxMinutes : 60;
  const defaultMinutes = Math.max(1, Math.min(120, defaultMinutesRaw));
  const maxMinutes = Math.max(defaultMinutes, Math.min(120, maxMinutesRaw));
  return { enabled, defaultMinutes, maxMinutes };
}
