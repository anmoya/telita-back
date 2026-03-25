import { Injectable } from "@nestjs/common";
import { PrismaAuditRepository } from "../../../../shared/infrastructure/persistence/prisma-audit.repository";
import { PrismaScrapsRepository } from "../../../scraps/infrastructure/persistence/prisma/prisma-scraps.repository";

@Injectable()
export class SalesScrapWorkflowService {
  constructor(
    private readonly scrapsRepo: PrismaScrapsRepository,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async offerPreview(input: {
    saleId: string;
    actorEmail: string;
    lineIds?: string[];
    limitPerLine?: number;
  }) {
    const result = await this.scrapsRepo.matchForSaleLines({
      saleId: input.saleId,
      lineIds: input.lineIds,
      limitPerLine: input.limitPerLine ?? 3
    });

    await this.auditRepo.logByActorEmail({
      actorEmail: input.actorEmail,
      entityType: "sale",
      entityId: input.saleId,
      action: "STATUS_CHANGE",
      afterJson: {
        event: "SCRAP_OFFER_PREVIEW_CREATED",
        linesChecked: result.lines.length,
        suggestionsFound: result.lines.reduce((acc, line) => acc + line.suggestions.length, 0)
      }
    });

    return result;
  }

  async previewAutoAssignment(input: { saleId: string; actorEmail: string }) {
    const result = await this.scrapsRepo.previewAutoAssignment({ saleId: input.saleId });
    await this.auditRepo.logByActorEmail({
      actorEmail: input.actorEmail,
      entityType: "sale",
      entityId: input.saleId,
      action: "STATUS_CHANGE",
      afterJson: {
        event: "AUTO_SCRAP_ASSIGNMENT_PREVIEW_CREATED",
        assignedPieces: result.summary.assignedPieces,
        unmatchedPieces: result.summary.unmatchedPieces
      }
    });
    return result;
  }

  async buildPickList(input: {
    saleId: string;
    actorEmail: string;
    items: Array<{ saleLineId: string; scrapId: string }>;
  }) {
    const result = await this.scrapsRepo.getPickListView({
      saleId: input.saleId,
      items: input.items
    });

    await this.auditRepo.logByActorEmail({
      actorEmail: input.actorEmail,
      entityType: "sale",
      entityId: input.saleId,
      action: "STATUS_CHANGE",
      afterJson: {
        event: "SCRAP_PICK_LIST_CREATED",
        itemCount: result.pickItems.length
      }
    });

    return result;
  }

  async generateCutSheet(input: {
    saleId: string;
    actorEmail: string;
    reserveSuggestedScraps: boolean;
  }) {
    return this.scrapsRepo.generateCutSheet({
      saleId: input.saleId,
      requestedByEmail: input.actorEmail,
      reserveSuggestedScraps: input.reserveSuggestedScraps
    });
  }
}
