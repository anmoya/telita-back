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
    if (!quote) throw new Error("Cotización no encontrada.");

    const user = await prismaClient.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

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
    if (!scrap) throw new Error("Retazo no encontrado.");
    if (scrap.status !== "STORED") throw new Error("El retazo debe estar en estado ALMACENADO para crear una etiqueta.");

    const user = await prismaClient.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

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
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.lines.length === 0) throw new Error("La venta no tiene líneas.");

    const user = await prismaClient.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

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
    if (!label) throw new Error("Etiqueta no encontrada.");

    const payload = label.payloadJson as Record<string, unknown>;
    const qrCode = (payload.qr as string) ?? `TELITA:LABEL:${label.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrCode)}`;

    const fields = Object.entries(payload)
      .filter(([k]) => k !== "qr" && k !== "kind")
      .map(([k, v]) => `<div class="field"><span class="label-key">${translatePayloadKey(k)}</span><span>${formatPayloadValue(k, v)}</span></div>`)
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
  <div class="type-badge">${translateLabelType(label.type)}</div>
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
</body>
</html>`;

    return Buffer.from(html, "utf-8");
  }

  async createBatch(input: {
    branchCode: string;
    items: Array<{ type: "SALE_LINE" | "SCRAP"; saleLineId?: string; scrapId?: string }>;
    createdByEmail: string;
  }) {
    const branch = await prismaClient.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new Error("Sucursal no encontrada.");
    const user = await prismaClient.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const results: { labelId: string; type: string; saleLineId?: string; scrapId?: string }[] = [];

    for (const item of input.items) {
      if (item.type === "SALE_LINE" && item.saleLineId) {
        // Idempotent: return existing label if one exists for this saleLineId
        const existing = await prismaClient.label.findFirst({ where: { saleLineId: item.saleLineId } });
        if (existing) {
          results.push({ labelId: existing.id, type: existing.type, saleLineId: item.saleLineId });
          continue;
        }
        const line = await prismaClient.saleLine.findUnique({
          where: { id: item.saleLineId },
          include: { sku: true, sale: true }
        });
        if (!line) continue;
        const payload = {
          kind: "sale_cut",
          saleId: line.saleId,
          saleLineId: line.id,
          skuCode: line.sku.code,
          widthM: Number(line.requestedWidthM),
          heightM: Number(line.requestedHeightM),
          quantity: line.quantity,
          lineTotal: Number(line.lineTotal),
          qr: `TELITA:SALE_LINE:${line.id}`
        };
        const label = await prismaClient.label.create({
          data: { branchId: branch.id, type: LabelType.SALE_CUT, saleLineId: line.id, payloadJson: payload, createdBy: user.id }
        });
        await this.auditRepo.log({ branchId: branch.id, actorUserId: user.id, entityType: "label", entityId: label.id, action: AuditAction.CREATE, afterJson: { type: label.type, saleLineId: line.id } });
        results.push({ labelId: label.id, type: label.type, saleLineId: line.id });
      } else if (item.type === "SCRAP" && item.scrapId) {
        const existing = await prismaClient.label.findFirst({ where: { scrapId: item.scrapId } });
        if (existing) {
          results.push({ labelId: existing.id, type: existing.type, scrapId: item.scrapId });
          continue;
        }
        const scrap = await prismaClient.scrap.findUnique({ where: { id: item.scrapId }, include: { sku: true, location: true } });
        if (!scrap) continue;
        const payload = {
          kind: "scrap",
          scrapId: scrap.id,
          skuCode: scrap.sku.code,
          areaM2: Number(scrap.areaM2),
          widthM: Number(scrap.widthM),
          heightM: Number(scrap.heightM),
          locationCode: scrap.location?.code ?? null,
          qr: `TELITA:SCRAP:${scrap.id}`
        };
        const label = await prismaClient.label.create({
          data: { branchId: branch.id, type: LabelType.SCRAP, scrapId: scrap.id, payloadJson: payload, createdBy: user.id }
        });
        await this.auditRepo.log({ branchId: branch.id, actorUserId: user.id, entityType: "label", entityId: label.id, action: AuditAction.CREATE, afterJson: { type: label.type, scrapId: scrap.id } });
        results.push({ labelId: label.id, type: label.type, scrapId: scrap.id });
      }
    }

    return results;
  }

  async getBatchPdfContent(labelIds: string[]): Promise<Buffer> {
    const labels = await prismaClient.label.findMany({
      where: { id: { in: labelIds } },
      include: { branch: true }
    });

    const labelCards = labels.map((label) => {
      const payload = label.payloadJson as Record<string, unknown>;
      const qrCode = (payload.qr as string) ?? `TELITA:LABEL:${label.id}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrCode)}`;
      const fields = Object.entries(payload)
        .filter(([k]) => k !== "qr" && k !== "kind")
        .map(([k, v]) => `<div class="field"><span class="label-key">${translatePayloadKey(k)}</span><span>${formatPayloadValue(k, v)}</span></div>`)
        .join("");
      return `
<div class="label">
  <div class="header">TELITA</div>
  <div class="type-badge">${translateLabelType(label.type)}</div>
  <div class="body-row">
    <div class="qr-block">
      <img src="${qrUrl}" width="120" height="120" alt="QR" />
      <div class="qr-code-text">${qrCode}</div>
    </div>
    <div class="info-block">${fields}</div>
  </div>
  <div class="footer">
    <span>Sucursal: ${label.branch?.name ?? label.branchId.slice(0, 8)}</span>
    <span>${label.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
    <span>ID: ${label.id.slice(0, 8)}</span>
  </div>
</div>`;
    }).join("\n");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Etiquetas Telita</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .label {
    border: 2px solid #1a1a1a;
    border-radius: 4px;
    padding: 6mm;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .header { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 2px; border-bottom: 1px solid #1a1a1a; padding-bottom: 3mm; margin-bottom: 4mm; }
  .type-badge { display: inline-block; background: #1a1a1a; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 2px; margin-bottom: 4mm; }
  .body-row { display: flex; gap: 6mm; align-items: flex-start; }
  .qr-block { text-align: center; }
  .qr-block img { display: block; border: 1px solid #ccc; }
  .qr-code-text { font-family: monospace; font-size: 7px; margin-top: 1mm; word-break: break-all; color: #555; max-width: 120px; }
  .info-block { flex: 1; }
  .field { display: flex; gap: 4px; font-size: 11px; margin-bottom: 2mm; }
  .label-key { min-width: 80px; font-weight: bold; color: #333; text-transform: uppercase; font-size: 9px; padding-top: 1px; }
  .footer { margin-top: 4mm; border-top: 1px solid #ccc; padding-top: 2mm; font-size: 9px; color: #666; display: flex; justify-content: space-between; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  .no-print { margin-bottom: 10mm; text-align: center; }
  .no-print button { font-size: 14px; padding: 8px 20px; cursor: pointer; margin: 0 8px; }
</style>
</head>
<body>
<div class="no-print">
  <button onclick="window.print()">🖨️ Imprimir</button>
  <button onclick="window.close()">✕ Cerrar</button>
</div>
<div class="sheet">
${labelCards}
</div>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    return Buffer.from(html, "utf-8");
  }

  async batchReprint(labelIds: string[], printedByEmail: string) {
    const user = await prismaClient.appUser.findUnique({ where: { email: printedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    let registered = 0;
    for (const labelId of labelIds) {
      const label = await prismaClient.label.findUnique({ where: { id: labelId } });
      if (!label) continue;
      await prismaClient.labelPrintEvent.create({
        data: { labelId, printedBy: user.id, printedAt: new Date(), channel: PrintChannel.BROWSER }
      });
      await this.auditRepo.log({ branchId: label.branchId, actorUserId: user.id, entityType: "label", entityId: label.id, action: AuditAction.PRINT, afterJson: { batch: true } });
      registered++;
    }
    return { registered };
  }

  async reprint(labelId: string, printedByEmail: string) {
    const label = await prismaClient.label.findUnique({ where: { id: labelId } });
    if (!label) throw new Error("Etiqueta no encontrada.");

    const user = await prismaClient.appUser.findUnique({ where: { email: printedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

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

const PAYLOAD_KEY_LABELS: Record<string, string> = {
  skuCode: "SKU",
  widthM: "Ancho (m)",
  heightM: "Alto (m)",
  areaM2: "Área (m²)",
  quantity: "Cantidad",
  totalRounded: "Total",
  lineTotal: "Total línea",
  currencyCode: "Moneda",
  locationCode: "Ubicación",
  saleId: "N° Venta",
  saleLineId: "Línea de venta",
  scrapId: "N° Retazo",
  quoteId: "N° Cotización"
};

const LABEL_TYPE_LABELS: Record<string, string> = {
  SALE_CUT: "Corte de venta",
  SCRAP: "Retazo"
};

function translatePayloadKey(key: string): string {
  return PAYLOAD_KEY_LABELS[key] ?? key;
}

function translateLabelType(type: string): string {
  return LABEL_TYPE_LABELS[type] ?? type;
}

function formatPayloadValue(key: string, value: unknown): string {
  if (key === "saleId" || key === "saleLineId" || key === "scrapId" || key === "quoteId") {
    return String(value).slice(0, 8).toUpperCase();
  }
  return String(value);
}
