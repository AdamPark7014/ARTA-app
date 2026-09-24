import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { DOC_STATUS_LABEL } from '../common/doc-guards';
import {
  HEADER_SECTION_ID,
  SIGNATURES_SECTION_ID,
  NO,
  YES,
  bindFormatToEvent,
  cellDisplay,
  columnTotal,
  isCheckType,
  normalizeFormatData,
  type FormatColumn,
  type FormatData,
  type FormatItem,
  type FormatSection,
} from '../common/format-schema';

type SignaturePayload = {
  signerName?: string;
  imageDataUrl?: string;
  signedAt?: string;
};

/**
 * Dónde quedó cada dato dentro del PDF.
 *
 * El PDF lo genera este servicio, así que puede decir en qué página y en qué
 * coordenadas escribió cada ítem. El panel usa ese mapa para poner un campo de
 * captura justo encima, y así se escribe **sobre el documento** en vez de en un
 * formulario aparte que lo controle.
 *
 * Coordenadas en puntos PDF desde la esquina superior izquierda de la página.
 * Las tablas y los adjuntos no llevan campo: se capturan en el formulario.
 */
export type PdfField = {
  sectionId: string;
  itemId: string;
  type: 'check' | 'value';
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PdfFieldMap = {
  pageWidth: number;
  pageHeight: number;
  fields: PdfField[];
};

type PdfInput = {
  title: string;
  eventName: string;
  entity: string;
  artist?: string | null;
  venue?: string | null;
  city?: string | null;
  templateKey?: string;
  data: FormatData | { sections?: unknown };
  delivered?: SignaturePayload | null;
  authorized?: SignaturePayload | null;
  editedBy?: string | null;
  editedAt?: Date | null;
  /** Borrador · En revisión · Aprobado · Sellado. */
  statusLabel?: string | null;
  /** Optional ticketing brand for header (name + logo file path). */
  boleteraName?: string | null;
  boleteraLogoPath?: string | null;
};

/* ── Hoja ───────────────────────────────────────────────────────────────── */

const PAGE_W = 612;
const PAGE_H = 792;
const M = 48;
const W = PAGE_W - 2 * M;
const RIGHT = PAGE_W - M;
const TOP = 40;
/** Alto reservado al pie (banda del cliente + folio). */
const FOOT_H = 64;
const BOTTOM = PAGE_H - 30 - FOOT_H;

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const ITALIC = 'Helvetica-Oblique';

const INK = '#111114';
const MUTED = '#6b6b72';
const LINE = '#cfcfd6';
const SOFT = '#f1f1f4';
/** Rayado tenue de los recuadros de texto largo. */
const RULE = '#e3e3e8';
const LINK = '#1a4fb8';
const GOLD = '#8b6914';
const GREEN = '#1f5c50';

const BRAND_DIR_CANDIDATES = [
  join(process.cwd(), 'assets', 'brand'),
  join(__dirname, '..', '..', 'assets', 'brand'),
  join(__dirname, '..', '..', '..', 'assets', 'brand'),
];

function brandAsset(name: string): string | null {
  for (const dir of BRAND_DIR_CANDIDATES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function dataUrlToBuffer(dataUrl?: string): Buffer | null {
  if (!dataUrl?.startsWith('data:image')) return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  try {
    return Buffer.from(parts[1], 'base64');
  } catch {
    return null;
  }
}

/** Helvetica estándar solo sabe WinAnsi: emojis y rarezas tumban el PDF. */
function safe(text: unknown): string {
  return String(text ?? '')
    .replace(/\r/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\n\x20-\x7E -ÿ]/g, '');
}

const upper = (text: string) => safe(text).toLocaleUpperCase('es-MX');

/** `2026-11-15` → `15/11/2026`; cualquier otra cosa tal cual. */
function dateDisplay(value: unknown): string {
  const t = safe(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

function valueDisplay(item: FormatItem): string {
  if (item.type === 'date') return dateDisplay(item.value);
  if (item.type === 'yesno') return safe(item.value).trim();
  return safe(item.value).replace(/\s+/g, ' ').trim();
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' });
}

/* ── Cursor de dibujo ───────────────────────────────────────────────────── */

type Cursor = {
  doc: PDFKit.PDFDocument;
  page: number;
  y: number;
  accent: string;
  fields: PdfField[];
  input: PdfInput;
  logo: string | null;
  footer: string | null;
  revisionLabel: string;
};

@Injectable()
export class ChecklistPdfService {
  constructor(private prisma: PrismaService) {}

  private uploadRoot() {
    const root = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const dir = join(root, 'checklists');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Resolve /uploads/... URL to absolute disk path under UPLOAD_DIR. */
  resolveUploadPath(url?: string | null): string | null {
    if (!url) return null;
    const cleaned = url.replace(/^\/uploads\/?/i, '').replace(/^uploads\//i, '');
    if (!cleaned || cleaned.includes('..')) return null;
    const root = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const full = join(root, cleaned);
    return existsSync(full) ? full : null;
  }

  async generate(
    checklistId: string,
    input: PdfInput,
    /**
     * Revisión del formato. El archivo lleva el número en el nombre, así que
     * **cada versión queda en disco**: el PDF que alguien firmó no se puede
     * pisar. Antes todo se escribía siempre en `<id>.pdf` y cada regeneración
     * borraba el documento anterior, firmas incluidas.
     */
    revision?: number,
  ): Promise<{ url: string; filePath: string; fieldMap: PdfFieldMap }> {
    const dir = this.uploadRoot();
    const fileName = revision === undefined ? `${checklistId}.pdf` : `${checklistId}-r${revision}.pdf`;
    const filePath = join(dir, fileName);
    const data = normalizeFormatData(input.data);

    const fields: PdfField[] = [];

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 0,
        autoFirstPage: false,
        bufferPages: true,
        info: { Title: `${input.title} - ${input.eventName}`, Author: 'Arta Producciones' },
      });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      const cur: Cursor = {
        doc,
        page: -1,
        y: TOP,
        accent: input.entity === 'EXPLANADA' ? GREEN : GOLD,
        fields,
        input,
        logo: brandAsset('arta-logo-ink.png'),
        footer: brandAsset('arta-footer.png'),
        revisionLabel: revision === undefined ? '' : `Rev. ${revision}`,
      };

      this.newPage(cur, true);

      for (const section of data.sections) {
        if (section.id === SIGNATURES_SECTION_ID) continue;
        if (!section.items.length) continue;
        if (section.layout === 'header' || section.id === HEADER_SECTION_ID) {
          this.drawHeaderSection(cur, section);
          continue;
        }
        this.drawSection(cur, section);
      }

      this.drawSignatures(cur);
      this.stampFooters(cur);

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    return {
      url: `/uploads/checklists/${fileName}`,
      filePath,
      fieldMap: { pageWidth: PAGE_W, pageHeight: PAGE_H, fields },
    };
  }

  /* ── Páginas ──────────────────────────────────────────────────────────── */

  private newPage(cur: Cursor, first = false) {
    const { doc, input } = cur;
    doc.addPage({ size: 'LETTER', margin: 0 });
    cur.page += 1;

    // Logo del cliente (los Word lo traen en el encabezado).
    const logoH = first ? 40 : 24;
    if (cur.logo) {
      try {
        doc.image(cur.logo, M, TOP, { height: logoH });
      } catch {
        doc.font(BOLD).fontSize(logoH * 0.7).fillColor(INK).text('arta', M, TOP, { lineBreak: false });
      }
    } else {
      doc.font(BOLD).fontSize(logoH * 0.7).fillColor(INK).text('arta', M, TOP, { lineBreak: false });
    }

    // Lado derecho: entidad, estado y trazabilidad.
    const entityName = input.entity === 'EXPLANADA' ? 'AUDITORIO AREMA · EXPLANADA' : 'ARTA PRODUCCIONES';
    doc.font(BOLD).fontSize(7.5).fillColor(cur.accent);
    doc.text(safe(entityName), M, TOP + 2, { width: W, align: 'right', lineBreak: false });
    const metaLines: string[] = [];
    if (first) {
      if (input.statusLabel) metaLines.push(upper(input.statusLabel));
      metaLines.push(
        [
          `Generado ${fmtDateTime(new Date())}`,
          cur.revisionLabel,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      if (input.editedBy) {
        metaLines.push(
          `Última edición: ${safe(input.editedBy)}${input.editedAt ? ` · ${fmtDateTime(input.editedAt)}` : ''}`,
        );
      }
    } else {
      metaLines.push(`${upper(input.title)} · ${safe(input.eventName)}`);
    }
    doc.font(FONT).fontSize(6.8).fillColor(MUTED);
    metaLines.forEach((line, i) => {
      doc.text(safe(line), M, TOP + 13 + i * 9, { width: W, align: 'right', lineBreak: false });
    });

    cur.y = TOP + logoH + (first ? 18 : 12);

    if (first) {
      // Título del formato, como en el Word: en mayúsculas, con filete de acento.
      doc.font(BOLD).fontSize(15).fillColor(INK);
      doc.text(upper(input.title), M, cur.y, { width: W, lineBreak: false });
      cur.y += 19;
      doc.font(FONT).fontSize(9).fillColor(MUTED);
      const sub = [input.eventName, input.artist, input.venue, input.city]
        .map((v) => safe(v).trim())
        .filter((v, i, all) => v && all.indexOf(v) === i)
        .join(' · ');
      doc.text(sub || ' ', M, cur.y, { width: W, lineBreak: false });
      cur.y += 13;
      doc.moveTo(M, cur.y).lineTo(RIGHT, cur.y).lineWidth(1.4).strokeColor(cur.accent).stroke();
      doc.moveTo(M, cur.y).lineTo(M + 42, cur.y).lineWidth(2.4).strokeColor(INK).stroke();
      cur.y += 14;
    } else {
      doc.moveTo(M, cur.y).lineTo(RIGHT, cur.y).lineWidth(0.6).strokeColor(LINE).stroke();
      cur.y += 10;
    }
  }

  /** Garantiza `h` puntos libres; si no caben, pasa de página. */
  private ensure(cur: Cursor, h: number) {
    if (cur.y + h > BOTTOM) this.newPage(cur);
  }

  /** Pie en todas las páginas: banda del cliente, filete y folio. */
  private stampFooters(cur: Cursor) {
    const { doc } = cur;
    const range = doc.bufferedPageRange();
    const total = range.start + range.count;
    for (let p = range.start; p < total; p += 1) {
      doc.switchToPage(p);
      const bandTop = PAGE_H - 30 - 52;
      doc.moveTo(M, bandTop - 6).lineTo(RIGHT, bandTop - 6).lineWidth(0.5).strokeColor(LINE).stroke();
      if (cur.footer) {
        try {
          doc.image(cur.footer, M, bandTop, { height: 52 });
        } catch {
          // sin banda, el PDF sigue siendo válido
        }
      }
      doc.font(FONT).fontSize(6.8).fillColor(MUTED);
      doc.text(`Página ${p - range.start + 1} de ${range.count}`, M, PAGE_H - 30 - 8, {
        width: W,
        align: 'right',
        lineBreak: false,
      });
      doc.text('Formato generado en el sistema ARTA · sin validez sin firmas', M, PAGE_H - 30 - 18, {
        width: W,
        align: 'right',
        lineBreak: false,
      });
    }
  }

  /* ── Encabezado del show (rejilla de 12 columnas) ─────────────────────── */

  private drawHeaderSection(cur: Cursor, section: FormatSection) {
    const { doc } = cur;
    const rowH = 27;
    const gap = 10;
    let colUsed = 0;
    let rowTop = cur.y;
    const rows: FormatItem[][] = [[]];
    for (const item of section.items) {
      const span = Math.min(12, Math.max(2, item.cols ?? 6));
      if (colUsed + span > 12) {
        rows.push([]);
        colUsed = 0;
      }
      rows[rows.length - 1].push({ ...item, cols: span });
      colUsed += span;
    }
    this.ensure(cur, rows.length * rowH + 8);
    rowTop = cur.y;
    for (const row of rows) {
      let x = M;
      for (const item of row) {
        const span = item.cols ?? 6;
        const cellW = (span / 12) * W - gap;
        doc.font(BOLD).fontSize(6.8).fillColor(MUTED);
        doc.text(upper(item.label), x, rowTop, { width: cellW, lineBreak: false });
        const value = valueDisplay(item);
        doc.font(FONT).fontSize(9.5).fillColor(INK);
        if (value) doc.text(this.fit(doc, value, 9.5, cellW), x, rowTop + 9, { width: cellW, lineBreak: false });
        doc.moveTo(x, rowTop + 21).lineTo(x + cellW, rowTop + 21).lineWidth(0.6).strokeColor(LINE).stroke();
        cur.fields.push({
          sectionId: section.id,
          itemId: item.id,
          type: 'value',
          page: cur.page,
          x,
          y: rowTop + 8,
          w: cellW,
          h: 12,
        });
        x += cellW + gap;
      }
      rowTop += rowH;
    }
    cur.y = rowTop + 6;
  }

  /* ── Secciones ────────────────────────────────────────────────────────── */

  private sectionTitle(cur: Cursor, title: string) {
    const { doc } = cur;
    this.ensure(cur, 40);
    cur.y += 4;
    doc.font(BOLD).fontSize(8.5).fillColor(cur.accent);
    doc.text(upper(title), M, cur.y, { width: W, lineBreak: false });
    cur.y += 11;
    doc.moveTo(M, cur.y).lineTo(RIGHT, cur.y).lineWidth(0.5).strokeColor(LINE).stroke();
    cur.y += 7;
  }

  private drawSection(cur: Cursor, section: FormatSection) {
    const items = section.items.filter((i) => i.type !== 'signature');
    if (!items.length) return;
    this.sectionTitle(cur, section.title);

    const allChecks = items.every((i) => isCheckType(i.type));
    const twoColumns = allChecks && (section.layout === 'columns' || items.length > 6);

    if (twoColumns) {
      this.drawChecksInColumns(cur, section, items);
      cur.y += 6;
      return;
    }

    for (const item of items) {
      if (isCheckType(item.type)) {
        this.ensure(cur, 16);
        this.drawCheck(cur, section, item, M, W);
        cur.y += 15;
      } else if (item.type === 'table') {
        this.drawTable(cur, section, item);
      } else if (item.type === 'longtext') {
        this.drawLongText(cur, section, item);
      } else if (item.type === 'yesno') {
        this.ensure(cur, 20);
        this.drawYesNo(cur, section, item);
      } else {
        this.drawValueLine(cur, section, item);
      }
    }
    cur.y += 6;
  }

  private drawChecksInColumns(cur: Cursor, section: FormatSection, items: FormatItem[]) {
    const colGap = 18;
    const colW = (W - colGap) / 2;
    const rowH = 15;
    let index = 0;
    while (index < items.length) {
      const remaining = items.length - index;
      const avail = Math.max(0, Math.floor((BOTTOM - cur.y) / rowH));
      if (avail < 2) {
        this.newPage(cur);
        continue;
      }
      const take = Math.min(remaining, avail * 2);
      const perCol = Math.ceil(take / 2);
      const chunk = items.slice(index, index + take);
      chunk.forEach((item, i) => {
        const col = i < perCol ? 0 : 1;
        const row = i < perCol ? i : i - perCol;
        const x = M + col * (colW + colGap);
        const y = cur.y + row * rowH;
        this.drawCheck(cur, section, item, x, colW, y);
      });
      cur.y += perCol * rowH;
      index += take;
    }
  }

  private drawCheck(cur: Cursor, section: FormatSection, item: FormatItem, x: number, width: number, yAt?: number) {
    const { doc } = cur;
    const y = yAt ?? cur.y;
    const box = 9;
    doc.rect(x, y + 1, box, box).lineWidth(0.7).strokeColor(INK).stroke();
    if (item.done) {
      doc.moveTo(x + 2, y + 5.5).lineTo(x + 4, y + 8).lineTo(x + 7.5, y + 2.5).lineWidth(1.3).strokeColor(INK).stroke();
    }
    doc.font(FONT).fontSize(9).fillColor(INK);
    const label = safe(item.label);
    const note = safe(item.note).trim();
    const textX = x + box + 5;
    let avail = width - box - 5;
    const labelText = this.fit(doc, label, 9, note ? Math.min(avail, avail * 0.6) : avail);
    doc.text(labelText, textX, y, { width: avail, lineBreak: false });
    if (note) {
      const labelW = doc.widthOfString(labelText);
      avail -= labelW + 6;
      doc.font(ITALIC).fontSize(8).fillColor(MUTED);
      doc.text(this.fit(doc, note, 8, avail), textX + labelW + 6, y + 0.8, { width: avail, lineBreak: false });
    }
    cur.fields.push({
      sectionId: section.id,
      itemId: item.id,
      type: 'check',
      page: cur.page,
      x,
      y: y + 1,
      w: box,
      h: box,
    });
  }

  private drawValueLine(cur: Cursor, section: FormatSection, item: FormatItem) {
    const { doc } = cur;
    const labelSize = 7.5;
    const valueSize = 9.5;
    const label = `${upper(item.label)}:`;
    doc.font(BOLD).fontSize(labelSize);
    const labelW = Math.min(doc.widthOfString(label) + 2, W * 0.55);
    const valueX = M + labelW + 6;
    const valueW = RIGHT - valueX;
    const value = valueDisplay(item);
    const isLink = item.type === 'attachment' && isHttpUrl(value);
    doc.font(FONT).fontSize(valueSize);
    const lines = value ? this.wrap(doc, value, valueSize, valueW - 2) : [''];
    const rowH = 18;
    const h = rowH + (lines.length - 1) * 12;
    this.ensure(cur, h + 2);
    const y = cur.y;
    doc.font(BOLD).fontSize(labelSize).fillColor(MUTED);
    doc.text(this.fit(doc, label, labelSize, labelW), M, y + 2.5, { width: labelW + 4, lineBreak: false });
    doc.font(FONT).fontSize(valueSize).fillColor(isLink ? LINK : INK);
    lines.forEach((line, i) => {
      if (line) doc.text(line, valueX, y + i * 12, { width: valueW + 4, lineBreak: false });
    });
    if (isLink) {
      doc.link(valueX, y, valueW, 12, value);
    }
    if (item.type === 'attachment' && !value && item.fileId) {
      doc.font(ITALIC).fontSize(8).fillColor(MUTED);
      doc.text('Adjunto en el formato', valueX, y + 1, { width: valueW, lineBreak: false });
    }
    const lineY = y + 12 + (lines.length - 1) * 12;
    doc.moveTo(valueX, lineY).lineTo(RIGHT, lineY).lineWidth(0.6).strokeColor(LINE).stroke();
    cur.fields.push({
      sectionId: section.id,
      itemId: item.id,
      type: 'value',
      page: cur.page,
      x: valueX,
      y: y - 1,
      w: valueW,
      h: 13,
    });
    cur.y += h;
  }

  private drawYesNo(cur: Cursor, section: FormatSection, item: FormatItem) {
    const { doc } = cur;
    const y = cur.y;
    const label = `${upper(item.label)}:`;
    doc.font(BOLD).fontSize(7.5).fillColor(MUTED);
    const labelW = Math.min(doc.widthOfString(label) + 2, W * 0.6);
    doc.text(this.fit(doc, label, 7.5, labelW), M, y + 2.5, { width: labelW + 4, lineBreak: false });
    const value = valueDisplay(item).toUpperCase();
    let x = M + labelW + 10;
    const startX = x;
    for (const opt of [YES, NO]) {
      const on = value === opt || (opt === YES && (value === 'SI' || value === 'YES'));
      doc.rect(x, y + 1, 9, 9).lineWidth(0.7).strokeColor(INK).stroke();
      if (on) {
        doc.moveTo(x + 2, y + 5.5).lineTo(x + 4, y + 8).lineTo(x + 7.5, y + 2.5).lineWidth(1.3).strokeColor(INK).stroke();
      }
      doc.font(on ? BOLD : FONT).fontSize(9).fillColor(INK);
      doc.text(opt, x + 13, y, { lineBreak: false });
      x += 13 + doc.widthOfString(opt) + 16;
    }
    cur.fields.push({
      sectionId: section.id,
      itemId: item.id,
      type: 'value',
      page: cur.page,
      x: startX,
      y: y - 1,
      w: Math.max(70, x - startX),
      h: 13,
    });
    cur.y += 18;
  }

  private drawLongText(cur: Cursor, section: FormatSection, item: FormatItem) {
    const { doc } = cur;
    const size = 9;
    const lineH = 13;
    const value = safe(item.value).trim();
    doc.font(FONT).fontSize(size);
    const lines = value ? this.wrap(doc, value, size, W - 12) : [];
    const rows = Math.max(3, lines.length);
    const boxH = rows * lineH + 8;
    this.ensure(cur, boxH + 14);
    const y = cur.y;
    doc.font(BOLD).fontSize(7.5).fillColor(MUTED);
    doc.text(`${upper(item.label)}:`, M, y, { width: W, lineBreak: false });
    const boxTop = y + 11;
    doc.rect(M, boxTop, W, boxH).lineWidth(0.5).strokeColor(LINE).stroke();
    for (let r = 1; r < rows; r += 1) {
      const ly = boxTop + 4 + r * lineH;
      doc.moveTo(M + 6, ly).lineTo(RIGHT - 6, ly).lineWidth(0.3).strokeColor(RULE).stroke();
    }
    doc.font(FONT).fontSize(size).fillColor(INK);
    lines.forEach((line, i) => {
      doc.text(line, M + 6, boxTop + 4 + i * lineH, { width: W - 12, lineBreak: false });
    });
    cur.fields.push({
      sectionId: section.id,
      itemId: item.id,
      type: 'value',
      page: cur.page,
      x: M,
      y: boxTop,
      w: W,
      h: boxH,
    });
    cur.y = boxTop + boxH + 8;
  }

  private drawTable(cur: Cursor, section: FormatSection, item: FormatItem) {
    const { doc } = cur;
    const columns = (item.columns ?? []).filter((c) => c.id);
    if (!columns.length) return;
    const rows = Array.isArray(item.rows) ? item.rows : [];
    const minRows = Math.max(1, item.minRows ?? 4);
    const count = Math.max(rows.length, minRows);
    const headH = 17;
    const rowH = 16;
    const pad = 4;
    const weights = columns.map((c) => Math.max(0.5, c.width ?? 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalWeight) * W);
    const xs: number[] = [M];
    widths.forEach((w) => xs.push(xs[xs.length - 1] + w));
    const totals = columns.map((c) => (c.total ? columnTotal(item, c.id) : null));
    const hasTotals = columns.some((c) => c.total);

    const label = section.items.length > 1 || section.title !== item.label ? upper(item.label) : '';
    if (label) {
      this.ensure(cur, 14 + headH + rowH * 2);
      doc.font(BOLD).fontSize(7.5).fillColor(MUTED);
      doc.text(`${label}:`, M, cur.y, { width: W, lineBreak: false });
      cur.y += 12;
    } else {
      this.ensure(cur, headH + rowH * 2);
    }

    const drawHead = () => {
      doc.rect(M, cur.y, W, headH).fillColor(SOFT).fill();
      doc.rect(M, cur.y, W, headH).lineWidth(0.6).strokeColor(INK).stroke();
      doc.font(BOLD).fontSize(7).fillColor(INK);
      columns.forEach((c, i) => {
        const numeric = c.type === 'number' || c.type === 'money';
        doc.text(this.fit(doc, upper(c.label), 7, widths[i] - pad * 2), xs[i] + pad, cur.y + 5.5, {
          width: widths[i] - pad * 2 + 2,
          align: numeric ? 'right' : 'left',
          lineBreak: false,
        });
      });
      cur.y += headH;
    };

    drawHead();
    for (let r = 0; r < count; r += 1) {
      if (cur.y + rowH > BOTTOM) {
        this.newPage(cur);
        drawHead();
      }
      const row = rows[r];
      const top = cur.y;
      doc.rect(M, top, W, rowH).lineWidth(0.4).strokeColor(LINE).stroke();
      xs.slice(1, -1).forEach((x) => doc.moveTo(x, top).lineTo(x, top + rowH).lineWidth(0.4).strokeColor(LINE).stroke());
      if (row) {
        doc.font(FONT).fontSize(8.5).fillColor(INK);
        columns.forEach((c, i) => {
          const raw = row[c.id];
          const textValue = c.type === 'date' ? dateDisplay(raw) : cellDisplay(c, raw);
          if (!textValue) return;
          const numeric = c.type === 'number' || c.type === 'money';
          doc.text(this.fit(doc, textValue, 8.5, widths[i] - pad * 2), xs[i] + pad, top + 4.5, {
            width: widths[i] - pad * 2 + 2,
            align: numeric ? 'right' : 'left',
            lineBreak: false,
          });
        });
      }
      cur.y += rowH;
    }

    if (hasTotals) {
      if (cur.y + rowH > BOTTOM) this.newPage(cur);
      const top = cur.y;
      doc.rect(M, top, W, rowH).fillColor(SOFT).fill();
      doc.rect(M, top, W, rowH).lineWidth(0.6).strokeColor(INK).stroke();
      doc.font(BOLD).fontSize(8.5).fillColor(INK);
      const firstTotal = columns.findIndex((c) => c.total);
      const labelCols = Math.max(1, firstTotal);
      doc.text(upper(item.totalLabel || 'Total'), M + pad, top + 4.5, { width: xs[labelCols] - M - pad * 2, lineBreak: false });
      columns.forEach((c, i) => {
        if (!c.total) return;
        const value = totals[i];
        const textValue = value === null ? '' : cellDisplay(c, value);
        doc.text(textValue, xs[i] + pad, top + 4.5, { width: widths[i] - pad * 2, align: 'right', lineBreak: false });
      });
      cur.y += rowH;
      const totalCols = columns.filter((c) => c.total);
      if (totalCols.length > 1) {
        const grand = totals.reduce<number>((sum, v) => sum + (v ?? 0), 0);
        const any = totals.some((v) => v !== null);
        doc.font(BOLD).fontSize(8.5).fillColor(INK);
        doc.text(`${upper(item.totalLabel || 'Total')} GENERAL: ${any ? cellDisplay(totalCols[0], grand) : ''}`, M, cur.y + 4, {
          width: W,
          align: 'right',
          lineBreak: false,
        });
        cur.y += 16;
      }
    }
    cur.y += 8;
  }

  /* ── Firmas ───────────────────────────────────────────────────────────── */

  private drawSignatures(cur: Cursor) {
    const { doc, input } = cur;
    const blockH = 126;
    this.ensure(cur, blockH + 16);
    cur.y += 6;
    doc.moveTo(M, cur.y).lineTo(RIGHT, cur.y).lineWidth(0.8).strokeColor(cur.accent).stroke();
    cur.y += 10;
    doc.font(BOLD).fontSize(8.5).fillColor(INK);
    doc.text('FIRMAS', M, cur.y, { lineBreak: false });
    cur.y += 14;
    const colW = (W - 24) / 2;
    this.drawSignatureBlock(doc, M, cur.y, colW, 'ENTREGADO', input.delivered);
    this.drawSignatureBlock(doc, M + colW + 24, cur.y, colW, 'AUTORIZADO', input.authorized);
    cur.y += blockH - 30;
  }

  private drawSignatureBlock(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    label: string,
    sig?: SignaturePayload | null,
  ) {
    doc.font(BOLD).fontSize(7).fillColor(MUTED).text(label, x, y, { lineBreak: false });
    const img = dataUrlToBuffer(sig?.imageDataUrl);
    const imgY = y + 11;
    const imgH = 56;
    if (img) {
      try {
        doc.image(img, x, imgY, { fit: [width, imgH] });
      } catch {
        doc.rect(x, imgY, width, imgH).lineWidth(0.5).strokeColor(LINE).stroke();
      }
    } else {
      doc.rect(x, imgY, width, imgH).lineWidth(0.5).dash(2, { space: 2 }).strokeColor(LINE).stroke().undash();
      doc.font(ITALIC).fontSize(7.5).fillColor(MUTED).text('Pendiente de firma', x + 8, imgY + 24, { lineBreak: false });
    }
    const lineY = imgY + imgH + 6;
    doc.moveTo(x, lineY).lineTo(x + width, lineY).lineWidth(0.6).strokeColor(INK).stroke();
    doc.font(FONT).fontSize(8.5).fillColor(INK);
    doc.text(safe(sig?.signerName || 'Nombre y firma'), x, lineY + 4, { width, lineBreak: false });
    if (sig?.signedAt) {
      const d = new Date(sig.signedAt);
      doc.font(FONT).fontSize(7).fillColor(MUTED);
      doc.text(Number.isNaN(d.getTime()) ? '' : fmtDateTime(d), x, lineY + 15, { width, lineBreak: false });
    }
  }

  /* ── Texto ────────────────────────────────────────────────────────────── */

  /**
   * Una línea que cabe en `maxWidth`; si no, se corta con «...».
   *
   * Se deja un punto de holgura: pdfkit parte la línea cuando el texto mide
   * exactamente el ancho de la caja (redondeo del kerning), y una etiqueta que
   * salta de renglón se monta encima del campo siguiente.
   */
  private fit(doc: PDFKit.PDFDocument, text: string, size: number, maxWidth: number): string {
    const t = safe(text).replace(/\s+/g, ' ').trim();
    const limit = Math.max(4, maxWidth - 1);
    doc.fontSize(size);
    if (doc.widthOfString(t) <= limit) return t;
    let out = t;
    while (out.length > 1 && doc.widthOfString(`${out}...`) > limit) out = out.slice(0, -1);
    return `${out.trimEnd()}...`;
  }

  /** Parte un texto en renglones que caben; respeta saltos de línea. */
  private wrap(doc: PDFKit.PDFDocument, text: string, size: number, maxWidth: number): string[] {
    doc.fontSize(size);
    const out: string[] = [];
    for (const paragraph of safe(text).split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        out.push('');
        continue;
      }
      let line = '';
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (doc.widthOfString(next) <= maxWidth) {
          line = next;
        } else {
          if (line) out.push(line);
          line = doc.widthOfString(word) <= maxWidth ? word : this.fit(doc, word, size, maxWidth);
        }
      }
      if (line) out.push(line);
    }
    return out.length ? out : [''];
  }

  /* ── Regeneración ─────────────────────────────────────────────────────── */

  /** Regenerate PDF for one checklist instance; returns updated row or null. */
  /**
   * @param force  Solo el flujo de firma lo usa: es el único caso en que hay
   *               que reimprimir un formato autorizado, porque justo acaba de
   *               firmarse y la firma tiene que quedar dentro del PDF.
   */
  async regenerateInstance(checklistId: string, options?: { force?: boolean }) {
    const item = await this.prisma.checklistInstance.findUnique({
      where: { id: checklistId },
      include: {
        event: true,
        template: true,
        lastEditedBy: { select: { fullName: true } },
      },
    });
    if (!item) return null;

    /*
     * Un formato autorizado no se vuelve a imprimir. Antes cualquier guardado
     * posterior a la firma reescribía el PDF con la imagen de la firma pegada
     * encima del contenido NUEVO: el documento parecía autorizado sin serlo.
     * `regenerateForEvent` ya protegía esto; por aquí se colaba.
     */
    if (!options?.force && (item.authorizedAt || item.authorizedSignature)) {
      return item;
    }

    const delivered = item.deliveredSignature as SignaturePayload | null;
    const authorized = item.authorizedSignature as SignaturePayload | null;

    const ticketing = await this.prisma.ticketingSetup.findFirst({
      where: { eventId: item.eventId },
      orderBy: { updatedAt: 'desc' },
      select: { boletera: true, logoUrl: true },
    });

    // El encabezado (show, fecha, hora, ciudad, venue) se completa desde el
    // evento si la persona no lo escribió; lo capturado manda.
    const data = bindFormatToEvent(normalizeFormatData(item.dataJson), item.event);

    const { url, fieldMap } = await this.generate(
      checklistId,
      {
        title: item.title,
        eventName: item.event.name,
        entity: item.event.entity,
        artist: item.event.artist,
        venue: item.event.venue,
        city: item.event.city,
        templateKey: item.template?.key,
        data,
        delivered: delivered
          ? { ...delivered, signedAt: delivered.signedAt || item.deliveredAt?.toISOString() }
          : null,
        authorized: authorized
          ? { ...authorized, signedAt: authorized.signedAt || item.authorizedAt?.toISOString() }
          : null,
        editedBy: item.lastEditedBy?.fullName,
        editedAt: item.lastEditedAt,
        statusLabel: DOC_STATUS_LABEL[item.status] ?? null,
        boleteraName: ticketing?.boletera || null,
        boleteraLogoPath: this.resolveUploadPath(ticketing?.logoUrl),
      },
      item.revision,
    );

    return this.prisma.checklistInstance.update({
      where: { id: checklistId },
      data: {
        pdfUrl: url,
        pdfGeneratedAt: new Date(),
        pdfFieldsJson: fieldMap as unknown as Prisma.InputJsonValue,
      },
      include: {
        template: true,
        lastEditedBy: { select: { id: true, fullName: true, email: true } },
        deliveredBy: { select: { id: true, fullName: true } },
        authorizedBy: { select: { id: true, fullName: true } },
        signatures: { orderBy: { signedAt: 'desc' }, take: 10 },
        files: true,
      },
    });
  }

  /** After boletera/logo changes, refresh draft checklist PDFs for the event.
   * Never rewrite PDFs already authorized (authorizedAt / authorizedSignature). */
  async regenerateForEvent(eventId: string): Promise<number> {
    const rows = await this.prisma.checklistInstance.findMany({
      where: { eventId },
      select: { id: true, authorizedAt: true, authorizedSignature: true },
    });
    let n = 0;
    for (const row of rows) {
      if (row.authorizedAt || row.authorizedSignature) continue;
      try {
        await this.regenerateInstance(row.id);
        n += 1;
      } catch {
        // keep going for other checklists
      }
    }
    return n;
  }

  /** Helper if we ever need to read an existing PDF buffer */
  readIfExists(checklistId: string): Buffer | null {
    const filePath = join(this.uploadRoot(), `${checklistId}.pdf`);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
  }
}

export type SignatureJson = Prisma.InputJsonValue;
