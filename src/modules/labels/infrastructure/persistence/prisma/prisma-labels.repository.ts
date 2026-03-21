import { Injectable } from "@nestjs/common";
import { AuditAction, LabelType, PrintChannel, Prisma } from "@prisma/client";
import { prismaClient } from "../../../../../shared/infrastructure/persistence/prisma-client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

@Injectable()
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
      include: {
        branch: true,
        customer: true,
        lines: {
          include: {
            sku: true,
            pieces: { orderBy: { pieceIndex: "asc" } }
          }
        }
      }
    });
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.lines.length === 0) throw new Error("La venta no tiene líneas.");

    const user = await prismaClient.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const results: Array<{
      labelId: string;
      saleLineId: string;
      saleLinePieceId: string;
      skuCode: string;
      pieceIndex: number;
      pieceTotal: number;
      roomAreaName: string | null;
      printEventId: string;
    }> = [];

    for (const line of sale.lines) {
      const pieces = line.pieces.length > 0
        ? line.pieces
        : [{
            id: line.id,
            pieceIndex: 1,
            pieceTotal: line.quantity,
            requestedWidthM: line.requestedWidthM,
            requestedHeightM: line.requestedHeightM,
            roomAreaName: line.roomAreaName
          }];

      for (const piece of pieces) {
        const payload = buildSalePiecePayload({
          sale,
          line,
          piece
        });

        const existing = await prismaClient.label.findFirst({
          where: {
            saleLineId: line.id,
            saleLinePieceId: piece.id
          }
        });

        const label = existing
          ? existing
          : await prismaClient.label.create({
              data: {
                branchId: sale.branchId,
                type: LabelType.SALE_CUT,
                saleLineId: line.id,
                saleLinePieceId: piece.id,
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
          action: existing ? AuditAction.PRINT : AuditAction.CREATE,
          afterJson: {
            type: label.type,
            saleId: sale.id,
            saleLineId: line.id,
            saleLinePieceId: piece.id,
            printEventId: event.id
          }
        });

        results.push({
          labelId: label.id,
          saleLineId: line.id,
          saleLinePieceId: piece.id,
          skuCode: line.sku.code,
          pieceIndex: piece.pieceIndex,
          pieceTotal: piece.pieceTotal,
          roomAreaName: piece.roomAreaName ?? line.roomAreaName ?? null,
          printEventId: event.id
        });
      }
    }

    return results;
  }

  async list(params: {
    branchCode?: string;
    saleLineId?: string;
    scrapId?: string;
    quoteId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const limit = Math.min(params.limit ?? 8, 100);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * limit;
    const where: Prisma.LabelWhereInput = {
      branch: params.branchCode ? { code: params.branchCode } : undefined,
      type: params.type === "SALE_CUT" || params.type === "SCRAP" ? params.type : undefined,
      saleLineId: params.saleLineId,
      scrapId: params.scrapId,
      quoteId: params.quoteId
    };
    const [data, total] = await Promise.all([
      prismaClient.label.findMany({
        where,
        include: {
          printEvents: { orderBy: { printedAt: "desc" }, take: 1 },
          saleLine: { include: { sale: { select: { quoteNumber: true } } } }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prismaClient.label.count({ where })
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getHtmlContent(labelId: string): Promise<Buffer> {
    const label = await prismaClient.label.findUnique({
      where: { id: labelId },
      include: { branch: true }
    });
    if (!label) throw new Error("Etiqueta no encontrada.");

    return Buffer.from(renderSingleLabelHtml(label), "utf-8");
  }

  async getPdfContent(labelId: string): Promise<Buffer> {
    return this.getHtmlContent(labelId);
  }

  async getZplContent(labelId: string): Promise<Buffer> {
    const label = await prismaClient.label.findUnique({ where: { id: labelId } });
    if (!label) throw new Error("Etiqueta no encontrada.");
    return Buffer.from(renderLabelZpl(label), "utf-8");
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

    const results: Array<{ labelId: string; type: string; saleLineId?: string; saleLinePieceId?: string; scrapId?: string }> = [];

    for (const item of input.items) {
      if (item.type === "SALE_LINE" && item.saleLineId) {
        const line = await prismaClient.saleLine.findUnique({
          where: { id: item.saleLineId },
          include: {
            sku: true,
            sale: { include: { customer: true, branch: true } },
            pieces: { orderBy: { pieceIndex: "asc" } }
          }
        });
        if (!line) continue;
        const pieces = line.pieces.length > 0
          ? line.pieces
          : [{
              id: line.id,
              pieceIndex: 1,
              pieceTotal: line.quantity,
              requestedWidthM: line.requestedWidthM,
              requestedHeightM: line.requestedHeightM,
              roomAreaName: line.roomAreaName
            }];
        for (const piece of pieces) {
          const existing = await prismaClient.label.findFirst({
            where: {
              saleLineId: line.id,
              saleLinePieceId: piece.id
            }
          });
          if (existing) {
            results.push({ labelId: existing.id, type: existing.type, saleLineId: line.id, saleLinePieceId: piece.id });
            continue;
          }
          const payload = buildSalePiecePayload({ sale: line.sale, line, piece });
          const label = await prismaClient.label.create({
            data: {
              branchId: branch.id,
              type: LabelType.SALE_CUT,
              saleLineId: line.id,
              saleLinePieceId: piece.id,
              payloadJson: payload,
              createdBy: user.id
            }
          });
          await this.auditRepo.log({
            branchId: branch.id,
            actorUserId: user.id,
            entityType: "label",
            entityId: label.id,
            action: AuditAction.CREATE,
            afterJson: { type: label.type, saleLineId: line.id, saleLinePieceId: piece.id }
          });
          results.push({ labelId: label.id, type: label.type, saleLineId: line.id, saleLinePieceId: piece.id });
        }
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

  async getBatchHtmlContent(labelIds: string[]): Promise<Buffer> {
    const labels = await prismaClient.label.findMany({
      where: { id: { in: labelIds } },
      include: { branch: true }
    });
    return Buffer.from(renderBatchLabelHtml(labels), "utf-8");
  }

  async getBatchPdfContent(labelIds: string[]): Promise<Buffer> {
    return this.getBatchHtmlContent(labelIds);
  }

  async getBatchZplContent(labelIds: string[]): Promise<Buffer> {
    const labels = await prismaClient.label.findMany({
      where: { id: { in: labelIds } }
    });
    return Buffer.from(labels.map((label) => renderLabelZpl(label)).join("\n"), "utf-8");
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
  skuName: "Tela",
  widthM: "Ancho (m)",
  heightM: "Alto (m)",
  areaM2: "Área (m²)",
  quantity: "Cantidad",
  pieceLabel: "Pieza",
  customerName: "Cliente",
  customerPhone: "Teléfono",
  customerEmail: "Email",
  customerReference: "Referencia",
  roomAreaName: "Ambiente",
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

function buildSalePiecePayload(input: {
  sale: {
    id: string;
    quoteNumber: number;
    customer?: {
      fullName: string;
      phone: string | null;
      email: string | null;
      companyOrReference: string | null;
    } | null;
    customerName?: string | null;
    customerReference?: string | null;
    branch?: { name: string } | null;
  };
  line: {
    id: string;
    sku: { code: string; name: string };
    lineTotal: { toString(): string } | number;
    roomAreaName?: string | null;
  };
  piece: {
    id: string;
    pieceIndex: number;
    pieceTotal: number;
    requestedWidthM: { toString(): string } | number;
    requestedHeightM: { toString(): string } | number;
    roomAreaName?: string | null;
  };
}) {
  return {
    kind: "sale_cut_piece",
    saleId: input.sale.id,
    quoteCode: `COT-${input.sale.quoteNumber}`,
    saleLineId: input.line.id,
    saleLinePieceId: input.piece.id,
    pieceIndex: input.piece.pieceIndex,
    pieceTotal: input.piece.pieceTotal,
    pieceLabel: `${input.piece.pieceIndex} de ${input.piece.pieceTotal}`,
    skuCode: input.line.sku.code,
    skuName: input.line.sku.name,
    widthM: Number(input.piece.requestedWidthM),
    heightM: Number(input.piece.requestedHeightM),
    quantity: 1,
    roomAreaName: input.piece.roomAreaName ?? input.line.roomAreaName ?? null,
    customerName: input.sale.customer?.fullName ?? input.sale.customerName ?? null,
    customerPhone: input.sale.customer?.phone ?? null,
    customerEmail: input.sale.customer?.email ?? null,
    customerReference: input.sale.customer?.companyOrReference ?? input.sale.customerReference ?? null,
    lineTotal: Number(input.line.lineTotal),
    qr: `TELITA:SALE_PIECE:${input.piece.id}`
  };
}

function renderSingleLabelHtml(label: { id: string; branchId: string; createdAt: Date; type: string; payloadJson: unknown; branch?: { name: string } | null }) {
  const payload = label.payloadJson as Record<string, unknown>;
  const qrCode = (payload.qr as string) ?? `TELITA:LABEL:${label.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrCode)}`;
  const fields = Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .filter(([k]) => !["qr", "kind"].includes(k))
    .map(([k, v]) => `<div class="field"><span class="label-key">${translatePayloadKey(k)}</span><span>${formatPayloadValue(k, v)}</span></div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Etiqueta Telita</title>
<style>
  @page { size: 100mm 45mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; padding: 4mm; }
  .label { border: 1.5px solid #1a1a1a; border-radius: 1mm; padding: 3mm 4mm; width: 100mm; height: 45mm; overflow: hidden; }
  .top-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1a1a1a; padding-bottom: 1.5mm; margin-bottom: 2mm; }
  .header { font-size: 12px; font-weight: bold; letter-spacing: 2px; }
  .type-badge { display: inline-block; background: #1a1a1a; color: #fff; font-size: 8px; padding: 1px 5px; border-radius: 2px; }
  .body-row { display: flex; gap: 3mm; align-items: flex-start; }
  .qr-block { flex-shrink: 0; }
  .qr-block img { display: block; }
  .info-block { flex: 1; overflow: hidden; }
  .field { display: flex; gap: 3px; font-size: 9px; margin-bottom: 1mm; line-height: 1.2; }
  .label-key { min-width: 55px; font-weight: bold; color: #333; text-transform: uppercase; font-size: 7.5px; padding-top: 0.5px; }
  .field span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .footer { margin-top: auto; border-top: 1px solid #ccc; padding-top: 1mm; font-size: 7px; color: #666; display: flex; justify-content: space-between; }
  @media screen { body { background: #f0f0f0; padding: 20mm; } .label { box-shadow: 0 1px 4px rgba(0,0,0,.15); background: #fff; } }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="label" style="display:flex;flex-direction:column">
  <div class="top-row">
    <span class="header">TELITA</span>
    <span class="type-badge">${translateLabelType(label.type)}</span>
  </div>
  <div class="body-row" style="flex:1;overflow:hidden">
    <div class="qr-block">
      <img src="${qrUrl}" width="80" height="80" alt="QR" />
    </div>
    <div class="info-block">${fields}</div>
  </div>
  <div class="footer">
    <span>${label.branch?.name ?? label.branchId.slice(0, 8)}</span>
    <span>${label.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
    <span>${label.id.slice(0, 8)}</span>
  </div>
</div>
</body>
</html>`;
}

function renderBatchLabelHtml(labels: Array<{ id: string; branchId: string; createdAt: Date; type: string; payloadJson: unknown; branch?: { name: string } | null }>) {
  const labelCards = labels.map((label) => {
    const payload = label.payloadJson as Record<string, unknown>;
    const qrCode = (payload.qr as string) ?? `TELITA:LABEL:${label.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrCode)}`;
    const fields = Object.entries(payload)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .filter(([k]) => !["qr", "kind"].includes(k))
      .map(([k, v]) => `<div class="field"><span class="label-key">${translatePayloadKey(k)}</span><span>${formatPayloadValue(k, v)}</span></div>`)
      .join("");
    return `<div class="label" style="display:flex;flex-direction:column">
  <div class="top-row">
    <span class="header">TELITA</span>
    <span class="type-badge">${translateLabelType(label.type)}</span>
  </div>
  <div class="body-row" style="flex:1;overflow:hidden">
    <div class="qr-block">
      <img src="${qrUrl}" width="80" height="80" alt="QR" />
    </div>
    <div class="info-block">${fields}</div>
  </div>
  <div class="footer">
    <span>${label.branch?.name ?? label.branchId.slice(0, 8)}</span>
    <span>${label.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
    <span>${label.id.slice(0, 8)}</span>
  </div>
</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Etiquetas Telita</title>
<style>
  @page { size: 100mm 45mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  .sheet { display: flex; flex-direction: column; align-items: center; gap: 0; }
  .label { border: 1.5px solid #1a1a1a; border-radius: 1mm; padding: 3mm 4mm; width: 100mm; height: 45mm; overflow: hidden; page-break-after: always; break-after: page; }
  .top-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1a1a1a; padding-bottom: 1.5mm; margin-bottom: 2mm; }
  .header { font-size: 12px; font-weight: bold; letter-spacing: 2px; }
  .type-badge { display: inline-block; background: #1a1a1a; color: #fff; font-size: 8px; padding: 1px 5px; border-radius: 2px; }
  .body-row { display: flex; gap: 3mm; align-items: flex-start; }
  .qr-block { flex-shrink: 0; }
  .qr-block img { display: block; }
  .info-block { flex: 1; overflow: hidden; }
  .field { display: flex; gap: 3px; font-size: 9px; margin-bottom: 1mm; line-height: 1.2; }
  .label-key { min-width: 55px; font-weight: bold; color: #333; text-transform: uppercase; font-size: 7.5px; padding-top: 0.5px; }
  .field span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .footer { margin-top: auto; border-top: 1px solid #ccc; padding-top: 1mm; font-size: 7px; color: #666; display: flex; justify-content: space-between; }
  @media screen { body { background: #f0f0f0; padding: 10mm; } .sheet { gap: 6mm; } .label { box-shadow: 0 1px 4px rgba(0,0,0,.15); background: #fff; break-after: auto; } }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="sheet">${labelCards}</div>
</body>
</html>`;
}

function renderLabelZpl(label: { id: string; type: string; payloadJson: unknown }) {
  const payload = label.payloadJson as Record<string, unknown>;
  const line1 = zplText(payload.customerName ?? payload.skuCode ?? "TELITA");
  const line2 = zplText(payload.roomAreaName ?? payload.pieceLabel ?? payload.locationCode ?? "");
  const line3 = zplText(`${payload.widthM ?? ""} x ${payload.heightM ?? ""}`);
  const line4 = zplText(payload.quoteCode ?? payload.skuName ?? "");
  const qr = zplText((payload.qr as string) ?? `TELITA:LABEL:${label.id}`);
  return `^XA
^PW800
^LL360
^FO40,20^A0N,28,28^FDTELITA ${translateLabelType(label.type)}^FS
^FO40,58^A0N,22,22^FD${line1}^FS
^FO40,88^A0N,22,22^FD${line2}^FS
^FO40,118^A0N,22,22^FD${line3}^FS
^FO40,148^A0N,22,22^FD${line4}^FS
^FO540,58^BQN,2,4^FDLA,${qr}^FS
^FO40,320^A0N,20,20^FD${zplText(label.id.slice(0, 8).toUpperCase())}^FS
^XZ`;
}

function zplText(value: unknown) {
  return String(value ?? "").replace(/[\^~]/g, " ");
}
