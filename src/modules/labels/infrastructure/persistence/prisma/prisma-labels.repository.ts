import { Injectable } from "@nestjs/common";
import { AuditAction, LabelType, Prisma, PrismaClient, PrintChannel } from "@prisma/client";
import { PrismaAuditRepository } from "../../../../../shared/infrastructure/persistence/prisma-audit.repository";

@Injectable()
export class PrismaLabelsRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: PrismaAuditRepository
  ) {}

  async createFromQuote(quoteId: string, createdByEmail: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { sku: true }
    });
    if (!quote) throw new Error("Cotización no encontrada.");

    const user = await this.prisma.appUser.findUnique({ where: { email: createdByEmail } });
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

    const label = await this.prisma.label.create({
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
    const scrap = await this.prisma.scrap.findUnique({
      where: { id: scrapId },
      include: { sku: true, location: true }
    });
    if (!scrap) throw new Error("Retazo no encontrado.");
    if (scrap.status !== "STORED") throw new Error("El retazo debe estar en estado ALMACENADO para crear una etiqueta.");

    const user = await this.prisma.appUser.findUnique({ where: { email: createdByEmail } });
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

    const label = await this.prisma.label.create({
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
    const sale = await this.prisma.sale.findUnique({
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

    const user = await this.prisma.appUser.findUnique({ where: { email: createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const results: Array<{
      labelId: string;
      saleLineId: string;
      skuCode: string;
      lineIndex: number;
      totalLines: number;
      roomAreaName: string | null;
      printEventId: string;
    }> = [];

    // Generate one label per line (not per piece)
    for (let i = 0; i < sale.lines.length; i++) {
      const line = sale.lines[i];
      const lineIndex = i + 1; // 1-based index
      
      const payload = buildSaleLinePayload({
        sale,
        line,
        lineIndex,
        totalLines: sale.lines.length
      });

      const existing = await this.prisma.label.findFirst({
        where: {
          saleLineId: line.id,
          saleLinePieceId: null // Line labels don't have piece ID
        }
      });

      const label = existing
        ? existing
        : await this.prisma.label.create({
            data: {
              branchId: sale.branchId,
              type: LabelType.SALE_CUT,
              saleLineId: line.id,
              saleLinePieceId: null,
              payloadJson: payload,
              createdBy: user.id
            }
          });

      const event = await this.prisma.labelPrintEvent.create({
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
          lineIndex,
          printEventId: event.id
        }
      });

      results.push({
        labelId: label.id,
        saleLineId: line.id,
        skuCode: line.sku.code,
        lineIndex,
        totalLines: sale.lines.length,
        roomAreaName: line.roomAreaName ?? null,
        printEventId: event.id
      });
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
      this.prisma.label.findMany({
        where,
        include: {
          printEvents: { orderBy: { printedAt: "desc" }, take: 1 },
          saleLine: { include: { sale: { select: { quoteNumber: true } } } }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      this.prisma.label.count({ where })
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
    const label = await this.prisma.label.findUnique({
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
    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (!label) throw new Error("Etiqueta no encontrada.");
    return Buffer.from(renderLabelZpl(label), "utf-8");
  }

  async createBatch(input: {
    branchCode: string;
    items: Array<{ type: "SALE_LINE" | "SCRAP"; saleLineId?: string; scrapId?: string }>;
    createdByEmail: string;
  }) {
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    if (!branch) throw new Error("Sucursal no encontrada.");
    const user = await this.prisma.appUser.findUnique({ where: { email: input.createdByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const results: Array<{ labelId: string; type: string; saleLineId?: string; saleLinePieceId?: string; scrapId?: string }> = [];

    for (const item of input.items) {
      if (item.type === "SALE_LINE" && item.saleLineId) {
        const line = await this.prisma.saleLine.findUnique({
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
          const existing = await this.prisma.label.findFirst({
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
          const label = await this.prisma.label.create({
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
        const existing = await this.prisma.label.findFirst({ where: { scrapId: item.scrapId } });
        if (existing) {
          results.push({ labelId: existing.id, type: existing.type, scrapId: item.scrapId });
          continue;
        }
        const scrap = await this.prisma.scrap.findUnique({ where: { id: item.scrapId }, include: { sku: true, location: true } });
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
        const label = await this.prisma.label.create({
          data: { branchId: branch.id, type: LabelType.SCRAP, scrapId: scrap.id, payloadJson: payload, createdBy: user.id }
        });
        await this.auditRepo.log({ branchId: branch.id, actorUserId: user.id, entityType: "label", entityId: label.id, action: AuditAction.CREATE, afterJson: { type: label.type, scrapId: scrap.id } });
        results.push({ labelId: label.id, type: label.type, scrapId: scrap.id });
      }
    }

    return results;
  }

  async getBatchHtmlContent(labelIds: string[]): Promise<Buffer> {
    const labels = await this.prisma.label.findMany({
      where: { id: { in: labelIds } },
      include: { branch: true }
    });
    return Buffer.from(renderBatchLabelHtml(labels), "utf-8");
  }

  async getBatchPdfContent(labelIds: string[]): Promise<Buffer> {
    return this.getBatchHtmlContent(labelIds);
  }

  async getBatchZplContent(labelIds: string[]): Promise<Buffer> {
    const labels = await this.prisma.label.findMany({
      where: { id: { in: labelIds } }
    });
    return Buffer.from(labels.map((label) => renderLabelZpl(label)).join("\n"), "utf-8");
  }

  async batchReprint(labelIds: string[], printedByEmail: string) {
    const user = await this.prisma.appUser.findUnique({ where: { email: printedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    let registered = 0;
    for (const labelId of labelIds) {
      const label = await this.prisma.label.findUnique({ where: { id: labelId } });
      if (!label) continue;
      await this.prisma.labelPrintEvent.create({
        data: { labelId, printedBy: user.id, printedAt: new Date(), channel: PrintChannel.BROWSER }
      });
      await this.auditRepo.log({ branchId: label.branchId, actorUserId: user.id, entityType: "label", entityId: label.id, action: AuditAction.PRINT, afterJson: { batch: true } });
      registered++;
    }
    return { registered };
  }

  async reprint(labelId: string, printedByEmail: string) {
    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (!label) throw new Error("Etiqueta no encontrada.");

    const user = await this.prisma.appUser.findUnique({ where: { email: printedByEmail } });
    if (!user) throw new Error("Usuario no encontrado.");

    const event = await this.prisma.labelPrintEvent.create({
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

function buildSaleLinePayload(input: {
  sale: {
    id: string;
    quoteNumber: number;
    createdAt: Date;
    customer?: {
      fullName: string;
      rut: string | null;
    } | null;
    customerName?: string | null;
  };
  line: {
    id: string;
    sku: { code: string; name: string };
    requestedWidthM: { toString(): string } | number;
    requestedHeightM: { toString(): string } | number;
    roomAreaName?: string | null;
  };
  lineIndex: number;
  totalLines: number;
}) {
  return {
    kind: "sale_line_label",
    saleId: input.sale.id,
    saleLineId: input.line.id,
    customerName: input.sale.customer?.fullName ?? input.sale.customerName ?? "Sin cliente",
    customerRut: input.sale.customer?.rut ?? "Sin RUT",
    purchaseOrderNumber: `COT-${input.sale.quoteNumber}`,
    itemIndex: input.lineIndex,
    totalItems: input.totalLines,
    purchaseDate: input.sale.createdAt.toISOString().split('T')[0],
    location: input.line.roomAreaName ?? "Sin ubicación",
    fabricName: input.line.sku.name,
    color: "Por implementar",
    width: Number(input.line.requestedWidthM),
    height: Number(input.line.requestedHeightM),
    qr: `TELITA:SALE_LINE:${input.line.id}`
  };
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
  
  // Check if this is a new sale line label
  if (isSaleLineLabelPayload(payload)) {
    return renderNewSaleLineHtml(payload);
  }
  
  // Fallback to old format for existing labels
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

function renderNewSaleLineHtml(payload: Record<string, unknown>) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Etiqueta Telita</title>
${renderNewSaleLineHtmlStyles(false)}
</head>
<body>
${renderNewSaleLineCardHtml(payload)}
</body>
</html>`;
}

function renderNewSaleLineCardHtml(payload: Record<string, unknown>) {
  const customerName = String(payload.customerName || "Sin cliente");
  const rut = String(payload.customerRut || "Sin RUT");
  const purchaseOrder = String(payload.purchaseOrderNumber || "Sin OC");
  const itemIndex = String(payload.itemIndex || "1");
  const totalItems = String(payload.totalItems || "1");
  const purchaseDate = String(payload.purchaseDate || "Sin fecha");
  const location = String(payload.location || "Sin ubicación");
  const fabric = String(payload.fabricName || "Sin tela");
  const color = String(payload.color || "Por implementar");
  const width = String(payload.width || "0");
  const height = String(payload.height || "0");

  return `<div class="label">
  <div class="header-section">
    <div class="customer-name">${customerName}</div>
    <div class="rut">Rut: ${rut}</div>
    <div class="purchase-order">Orden de compra: ${purchaseOrder}</div>
    <div class="divider"></div>
  </div>
  
  <div class="content-section">
    <div class="info-label">Ubicación:</div>
    <div class="info-value">${location}</div>
    
    <div class="info-label">Tela:</div>
    <div class="info-value">${fabric}</div>
    
    <div class="info-label">Color:</div>
    <div class="info-value">${color}</div>
    
    <div class="info-label">Ancho:</div>
    <div class="info-value">${width}</div>
    
    <div class="info-label">Alto:</div>
    <div class="info-value">${height}</div>
  </div>
  
  <div class="footer-section">
    <div class="item-counter">${itemIndex} de ${totalItems}</div>
    <div class="purchase-date">Fecha de compra: ${purchaseDate}</div>
  </div>
</div>`;
}

function renderNewSaleLineHtmlStyles(isBatch: boolean) {
  return `<style>
  @page { size: 148mm 66mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { 
    font-family: Arial, sans-serif; 
    background: #f0f0f0; 
    display: flex; 
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
    padding: 8mm;
    ${isBatch ? "flex-direction: column;" : ""}
  }
  .label { 
    width: 148mm;
    min-height: 66mm;
    max-width: 100%;
    background: #fff;
    font-family: Arial, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,.2);
    padding: 4mm;
    display: flex;
    flex-direction: column;
    margin: 0 auto;
    overflow: hidden;
    ${isBatch ? "page-break-after: always; break-after: page;" : ""}
  }
  
  .header-section {
    margin-bottom: 2.5mm;
    min-width: 0;
  }
  
  .customer-name { 
    font-size: 18px;
    font-weight: bold; 
    margin-bottom: 1mm;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .rut { 
    font-size: 17px;
    font-weight: bold; 
    margin-bottom: 1mm;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .purchase-order { 
    font-size: 18px;
    font-weight: bold; 
    margin-bottom: 2.5mm;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .divider { 
    height: 2px; 
    background: #000; 
    margin-bottom: 2.5mm;
    width: 100%;
  }
  
  .content-section {
    flex: 1;
    display: grid;
    grid-template-columns: 20mm minmax(0, 1fr);
    gap: 2mm 3mm;
    align-content: start;
    margin-bottom: 3mm;
    min-width: 0;
  }
  
  .info-label {
    font-size: 15px;
    font-weight: bold; 
    line-height: 1.15;
    white-space: nowrap;
  }
  
  .info-value {
    font-size: 15px;
    line-height: 1.15;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .footer-section {
    margin-top: auto;
    border: 2px solid #000;
    padding: 2.5mm 3mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 3mm;
    min-height: 11mm;
    min-width: 0;
  }
  
  .item-counter { 
    font-size: 15px;
    font-weight: bold; 
    line-height: 1.15;
    white-space: nowrap;
    flex-shrink: 0;
  }
  
  .purchase-date { 
    font-size: 12px;
    line-height: 1.15;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  @media print { 
    body { background: #fff; padding: 0; margin: 0; }
    .label { box-shadow: none; width: 148mm; min-height: 66mm; }
  }
  @media screen {
    body { gap: ${isBatch ? "6mm" : "0"}; }
  }
</style>`;
}

function renderBatchLabelHtml(labels: Array<{ id: string; branchId: string; createdAt: Date; type: string; payloadJson: unknown; branch?: { name: string } | null }>) {
  if (labels.length > 0 && labels.every((label) => isSaleLineLabelPayload(label.payloadJson as Record<string, unknown>))) {
    const labelCards = labels.map((label) => renderNewSaleLineCardHtml(label.payloadJson as Record<string, unknown>)).join("\n");
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Etiquetas Telita</title>
${renderNewSaleLineHtmlStyles(true)}
</head>
<body>
${labelCards}
</body>
</html>`;
  }

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

function isSaleLineLabelPayload(payload: Record<string, unknown>) {
  return payload.kind === "sale_line_label";
}

function renderLabelZpl(label: { id: string; type: string; payloadJson: unknown }) {
  const payload = label.payloadJson as Record<string, unknown>;
  
  // Check if this is a new sale line label or old format
  if (payload.kind === "sale_line_label") {
    return renderNewSaleLineZpl(payload);
  }
  
  // Fallback to old format for existing labels
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

function renderNewSaleLineZpl(payload: Record<string, unknown>) {
  const customerName = zplText(payload.customerName || "Sin cliente");
  const rut = zplText(payload.customerRut || "Sin RUT");
  const purchaseOrder = zplText(payload.purchaseOrderNumber || "Sin OC");
  const itemIndex = zplText(payload.itemIndex || "1");
  const totalItems = zplText(payload.totalItems || "1");
  const purchaseDate = zplText(payload.purchaseDate || "Sin fecha");
  const location = zplText(payload.location || "Sin ubicación");
  const fabric = zplText(payload.fabricName || "Sin tela");
  const color = zplText(payload.color || "Por implementar");
  const width = zplText(payload.width || "0");
  const height = zplText(payload.height || "0");

  return `^XA
^LL531
^PW1181
^FO96,15^A0N,24,24^FD${customerName}^FS
^FO96,86^A0N,25,25^FDOrden de compra: ${purchaseOrder}^FS
^FO96,121^GB944,2,2^FS
^FO97,429^GB458,2,2^FS
^FO96,435^GB944,80,2^FS
^FO114,450^A0N,20,20^FD${itemIndex} de ${totalItems}^FS
^FO96,50^A0N,24,24^FDRut: ${rut}^FS
^FO97,147^A0N,20,20^FDUbicación:^FS
^FO180,147^A0N,20,20^FD${location}^FS
^FO116,486^A0N,16,16^FDFecha de compra: ${purchaseDate}^FS
^FO97,192^A0N,20,20^FDTela:^FS
^FO135,192^A0N,20,20^FD${fabric}^FS
^FO97,282^A0N,20,20^FDAncho:^FS
^FO155,282^A0N,20,20^FD${width}^FS
^FO97,327^A0N,20,20^FDAlto:^FS
^FO140,327^A0N,20,20^FD${height}^FS
^FO97,237^A0N,20,20^FDColor:^FS
^FO150,237^A0N,20,20^FD${color}^FS
^FO927,445
^GFA,624,624,12,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000000000000000000000000,000800000000000000000000,000040000000000000000000,008900000000000000000000,002400000000000000000000,002280000000000000000000,009400000000000000000000,0122A0000000000000000000,021400000000000000000000,004280000000000000140000,001400000000000000228000,0040A0000000000000000000,000400000000000000A14000,000000000000000000000000,00080000000000000080A000,000000000000000001001000,00E00018000C080000004000,00E00018000C180002800000,00A0DE1D208E08340260CF80,01B0EB36608B18EE446188E0,013041086189088228408C40,0190C198208D99830460CC00,0318C3186088C9FF28618780,03384188619C5880006080C0,06A8C118208869852A619060,040CC18C618838C61031CC60,0604C30E3F8C107C423F0FC0,000400010008080020008100,000000000000000080000000,0000000000000A0040000000,000000000000000100000000,000000000000050200000000,000000000000000100000000,000000000000028400000000,000000000000002200000000,000000000000014800000000,000000000000001000000000,000000000000000000000000
^FS
^XZ`;
}

function zplText(value: unknown) {
  return String(value ?? "").replace(/[\^~]/g, " ");
}
