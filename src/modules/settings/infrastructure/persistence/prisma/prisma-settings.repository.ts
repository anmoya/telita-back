import { AuditAction } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

const FLOW_RULES_KEY = "flow_rules";
// Fixed UUID used as entityId for system_setting audit entries (no UUID PK on that table)
const FLOW_RULES_AUDIT_ID = "00000000-0000-0000-0000-000000000001";

export type ScrapRequiredAtStage = "NONE" | "AT_CUT" | "AT_SALE_CLOSE";

export type FlowRules = {
  scrapRequiredAtStage: ScrapRequiredAtStage;
};

const DEFAULT_FLOW_RULES: FlowRules = { scrapRequiredAtStage: "NONE" };

export class PrismaSettingsRepository {
  private readonly auditRepo = new PrismaAuditRepository();

  async getFlowRules(): Promise<FlowRules> {
    const setting = await prismaClient.systemSetting.findUnique({ where: { key: FLOW_RULES_KEY } });
    if (!setting) return { ...DEFAULT_FLOW_RULES };
    const parsed = setting.valueJson as Record<string, unknown>;
    const stage = parsed.scrapRequiredAtStage as ScrapRequiredAtStage | undefined;
    return { scrapRequiredAtStage: stage ?? "NONE" };
  }

  async updateFlowRules(rules: FlowRules, updatedByEmail: string): Promise<FlowRules> {
    const user = await prismaClient.appUser.findUnique({ where: { email: updatedByEmail } });
    if (!user) throw new Error("User not found.");

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

    return rules;
  }
}
