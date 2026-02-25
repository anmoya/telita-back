import { AuditAction, LabelType, PrintChannel, Prisma } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

export class PrismaLabelsRepository {
  private readonly auditRepo = new PrismaAuditRepository();

  async createFromQuote(quoteId: string, createdByEmail: string) {
    const quote = await prismaClient.quote.findUnique({
      where: { id: quoteId },
      include: { sku: true }
    });
    if (!quote) throw new Error("Quote not found.");

    const user = await prismaClient.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("User not found.");

    const payload = {
      kind: "quote",
      quoteId: quote.id,
      skuCode: quote.sku.code,
      widthM: Number(quote.requestedWidthM),
      heightM: Number(quote.requestedHeightM),
      quantity: quote.quantity,
      totalRounded: Number(quote.totalRounded),
      currencyCode: quote.currencyCode,
      qr: `TELITA:QUOTE:${quote.id}`
    };

    const label = await prismaClient.label.create({
      data: {
        branchId: quote.branchId,
        type: LabelType.SALE_CUT,
        quoteId: quote.id,
        payloadJson: payload,
        createdBy: user.id
      }
    });
    await this.auditRepo.log({
      branchId: quote.branchId,
      actorUserId: user.id,
      entityType: "label",
      entityId: label.id,
      action: AuditAction.CREATE,
      afterJson: { type: label.type, quoteId: quote.id }
    });
    return label;
  }

  async createFromScrap(scrapId: string, createdByEmail: string) {
    const scrap = await prismaClient.scrap.findUnique({
      where: { id: scrapId },
      include: { sku: true, location: true }
    });
    if (!scrap) throw new Error("Scrap not found.");
    if (scrap.status !== "STORED") throw new Error("Scrap label requires STORED status.");

    const user = await prismaClient.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("User not found.");

    const payload = {
      kind: "scrap",
      scrapId: scrap.id,
      skuCode: scrap.sku.code,
      areaM2: Number(scrap.areaM2),
      widthM: Number(scrap.widthM),
      heightM: Number(scrap.heightM),
      locationCode: scrap.location?.code,
      qr: `TELITA:SCRAP:${scrap.id}`
    };

    const label = await prismaClient.label.create({
      data: {
        branchId: scrap.branchId,
        type: LabelType.SCRAP,
        scrapId: scrap.id,
        payloadJson: payload,
        createdBy: user.id
      }
    });
    await this.auditRepo.log({
      branchId: scrap.branchId,
      actorUserId: user.id,
      entityType: "label",
      entityId: label.id,
      action: AuditAction.CREATE,
      afterJson: { type: label.type, scrapId: scrap.id }
    });
    return label;
  }

  async createBatchFromSale(saleId: string, createdByEmail: string) {
    const sale = await prismaClient.sale.findUnique({
      where: { id: saleId },
      include: { lines: { include: { sku: true } }, branch: true }
    });
    if (!sale) throw new Error("Sale not found.");
    if (sale.lines.length === 0) throw new Error("Sale has no lines.");

    const user = await prismaClient.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("User not found.");

    const results: { labelId: string; saleLineId: string; skuCode: string; printEventId: string }[] = [];

    for (const line of sale.lines) {
      const payload = {
        kind: "sale_cut",
        saleId: sale.id,
        saleLineId: line.id,
        skuCode: line.sku.code,
        widthM: Number(line.requestedWidthM),
        heightM: Number(line.requestedHeightM),
        quantity: line.quantity,
        lineTotal: Number(line.lineTotal),
        qr: `TELITA:SALE_LINE:${line.id}`
      };

      const label = await prismaClient.label.create({
        data: {
          branchId: sale.branchId,
          type: LabelType.SALE_CUT,
          saleLineId: line.id,
          payloadJson: payload,
          createdBy: user.id
        }
      });

      const event = await prismaClient.labelPrintEvent.create({
        data: {
          labelId: label.id,
          printedBy: user.id,
          printedAt: new Date(),
          channel: PrintChannel.BROWSER
        }
      });

      await this.auditRepo.log({
        branchId: sale.branchId,
        actorUserId: user.id,
        entityType: "label",
        entityId: label.id,
        action: AuditAction.PRINT,
        afterJson: { type: label.type, saleId: sale.id, saleLineId: line.id, printEventId: event.id }
      });

      results.push({ labelId: label.id, saleLineId: line.id, skuCode: line.sku.code, printEventId: event.id });
    }

    return results;
  }

  async list(params: { branchCode?: string; saleLineId?: string; scrapId?: string; quoteId?: string }) {
    const where: Prisma.LabelWhereInput = {
      branch: params.branchCode ? { code: params.branchCode } : undefined,
      saleLineId: params.saleLineId,
      scrapId: params.scrapId,
      quoteId: params.quoteId
    };
    return prismaClient.label.findMany({
      where,
      include: {
        printEvents: { orderBy: { printedAt: "desc" }, take: 1 }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async getPdfContent(labelId: string): Promise<Buffer> {
    const label = await prismaClient.label.findUnique({
      where: { id: labelId },
      include: { branch: true }
    });
    if (!label) throw new Error("Label not found.");

    const payload = label.payloadJson as Record<string, unknown>;
    const qrCode = (payload.qr as string) ?? `TELITA:LABEL:${label.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrCode)}`;

    const fields = Object.entries(payload)
      .filter(([k]) => k !== "qr" && k !== "kind")
      .map(([k, v]) => `<div class="field"><span class="label-key">${k}</span><span>${String(v)}</span></div>`)
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Etiqueta Telita</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  .label {
    border: 2px solid #1a1a1a;
    border-radius: 4px;
    padding: 8mm;
    max-width: 180mm;
    margin: 0 auto;
    page-break-inside: avoid;
  }
  .header {
    text-align: center;
    font-size: 20px;
    font-weight: bold;
    letter-spacing: 2px;
    border-bottom: 1px solid #1a1a1a;
    padding-bottom: 4mm;
    margin-bottom: 5mm;
  }
  .type-badge {
    display: inline-block;
    background: #1a1a1a;
    color: #fff;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 2px;
    margin-bottom: 5mm;
  }
  .body-row { display: flex; gap: 8mm; align-items: flex-start; }
  .qr-block { text-align: center; }
  .qr-block img { display: block; border: 1px solid #ccc; }
  .qr-code-text { font-family: monospace; font-size: 8px; margin-top: 2mm; word-break: break-all; color: #555; max-width: 140px; }
  .info-block { flex: 1; }
  .field { display: flex; gap: 6px; font-size: 13px; margin-bottom: 3mm; }
  .label-key { min-width: 90px; font-weight: bold; color: #333; text-transform: uppercase; font-size: 10px; padding-top: 2px; }
  .footer { margin-top: 5mm; border-top: 1px solid #ccc; padding-top: 3mm; font-size: 10px; color: #666; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="label">
  <div class="header">TELITA</div>
  <div class="type-badge">${label.type}</div>
  <div class="body-row">
    <div class="qr-block">
      <img src="${qrUrl}" width="140" height="140" alt="QR" />
      <div class="qr-code-text">${qrCode}</div>
    </div>
    <div class="info-block">
      ${fields}
    </div>
  </div>
  <div class="footer">
    <span>Sucursal: ${label.branch?.name ?? label.branchId.slice(0, 8)}</span>
    <span>${label.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
    <span>ID: ${label.id.slice(0, 8)}</span>
  </div>
</div>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    return Buffer.from(html, "utf-8");
  }

  async reprint(labelId: string, printedByEmail: string) {
    const label = await prismaClient.label.findUnique({ where: { id: labelId } });
    if (!label) throw new Error("Label not found.");

    const user = await prismaClient.appUser.findUnique({ where: { email: printedByEmail } });
    if (!user) throw new Error("User not found.");

    const event = await prismaClient.labelPrintEvent.create({
      data: {
        labelId: label.id,
        printedBy: user.id,
        printedAt: new Date(),
        channel: PrintChannel.BROWSER
      }
    });
    await this.auditRepo.log({
      branchId: label.branchId,
      actorUserId: user.id,
      entityType: "label",
      entityId: label.id,
      action: AuditAction.PRINT,
      afterJson: { printEventId: event.id, channel: event.channel }
    });
    return event;
  }
}
