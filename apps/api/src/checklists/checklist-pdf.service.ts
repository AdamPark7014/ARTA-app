import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PdfBrandingService } from '../uploads/pdf-branding.service';
import { DOC_STATUS_LABEL } from '../common/doc-guards';
import {
  HEADER_SECTION_ID,
  SIGNATURES_SECTION_ID,
  NO,
  YES,
  attachmentFiles,
  bindFormatToEvent,
  cellDisplay,
  columnTotal,
  gallerySummary,
  isCheckType,
  mediaKind,
  isParagraphType,
  normalizeFormatData,
  signatureLabels,
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

/**
 * Un archivo de galería ya resuelto contra la base: dónde está en disco (para
 * imprimir la foto) y su `/uploads/…` (para el link). Lo arma
 * `regenerateInstance`; el script de muestras lo pasa a mano.
 */
export type PdfMedia = {
  path: string | null;
  url: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  /** El adjunto se borró del evento (papelera): se lista, sin foto ni link. */
  deleted?: boolean;
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
  /**
   * Marca de agua BORRADOR. Por defecto, mientras no esté aprobado o sellado;
   * un documento sin flujo de aprobación (inventario semanal) pasa `false`.
   */
  watermark?: boolean;
  /** Optional ticketing brand for header (name + logo file path). */
  boleteraName?: string | null;
  boleteraLogoPath?: string | null;
  /** Optional folio id rendered in footer. */
  folio?: string | null;
  /** Archivos de las galerías por `fileId` (fotos y videos de un recorrido). */
  media?: Record<string, PdfMedia>;
  /** Origen del panel (`https://auditorio…`) para que los links de fotos y videos abran fuera del sistema. */
  linkBase?: string | null;
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
/** Dónde empieza el contenido en una hoja de continuación (logo chico + filete). */
const CONTINUATION_TOP = TOP + 24 + 12 + 10;
/**
 * Alto del renglón de firmas al final del documento: aire tras el contenido,
 * espacio para la firma, línea, nombre, a quién corresponde y fecha.
 */
const SIGN_GAP = 18;
const SIGN_IMG_H = 46;
const SIGN_H = SIGN_GAP + SIGN_IMG_H + 4 + 38;

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
const GOLD = '#0c0c0d';
const GREEN = '#3f3f45';

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

/** Fotos que se imprimen por galería: el resto queda en el sistema (un PDF de 40 fotos pesa decenas de MB). */
const GALLERY_MAX_PRINTED = 36;
/** Una foto más pesada que esto no se incrusta (las que sube el panel ya llegan reducidas). */
const GALLERY_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Origen del panel para los links del PDF. `WEB_ORIGIN` puede traer varios
 * (Arta y Auditorio): cada entidad abre en el suyo.
 */
export function panelOrigin(entity?: string | null): string | null {
  const list = [process.env.WEB_ORIGIN, process.env.NEXT_PUBLIC_APP_URL, process.env.PUBLIC_WEB_URL]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter((o) => /^https?:\/\//i.test(o));
  if (!list.length) return null;
  const want = entity === 'EXPLANADA' ? /auditorio/i : /\/\/arta\./i;
  return list.find((o) => want.test(o)) ?? list[0];
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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
  isDraft: boolean;
  /** Índice (en `data.sections`) de la sección que se está dibujando. */
  section: number;
  /** Dónde arranca cada ítem de la sección en curso. */
  itemStarts: Array<{ item: number; page: number; y: number }>;
  /** Segunda composición: antes de qué se pasa de hoja para que las firmas no queden solas. */
  breakAt: PageBreak | null;
};

/** Pasar de hoja antes de una sección (`item: null`) o de uno de sus ítems. */
type PageBreak = { section: number; item: number | null };

type Mark = { page: number; y: number };

/** Dónde quedaron las firmas respecto al contenido: lo que prueba que van juntas. */
export type PdfSignatureLayout = {
  /** Hoja (desde 0) y altura donde empieza el renglón de firmas. */
  signatures: Mark;
  /** Dónde terminó el contenido del formato, justo antes de las firmas. */
  contentEnd: Mark;
  /** Dónde empieza la última sección con contenido. */
  lastSection: Mark | null;
};

@Injectable()
export class ChecklistPdfService {
  constructor(private prisma: PrismaService, private branding: PdfBrandingService = new PdfBrandingService()) {}

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
  ): Promise<{ url: string; filePath: string; fieldMap: PdfFieldMap; layout: PdfSignatureLayout }> {
    const dir = this.uploadRoot();
    const fileName = revision === undefined ? `${checklistId}.pdf` : `${checklistId}-r${revision}.pdf`;
    const filePath = join(dir, fileName);
    const data = normalizeFormatData(input.data);

    /*
     * Las firmas van ABAJO, dentro del documento, como los renglones de firma
     * de un Word impreso (junta del 23-10-2026). Si no caben en la última hoja
     * no se quedan solas hasta arriba de una hoja nueva: se vuelve a componer
     * llevándose con ellas la última sección («conservar con el siguiente»).
     * Solo cuando hace falta se compone dos veces; lo normal es una.
     */
    let pass = this.compose(input, data, revision, null);
    if (pass.keepWithSignatures) {
      pass = this.compose(input, data, revision, pass.keepWithSignatures);
    }
    const { cur, lastSection } = pass;
    const contentEnd = { page: cur.page, y: cur.y };

    const signatures = this.drawSignatures(cur);
    this.stampFooters(cur);

    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      cur.doc.pipe(stream);
      cur.doc.end();
    });

    return {
      url: `/uploads/checklists/${fileName}`,
      filePath,
      fieldMap: { pageWidth: PAGE_W, pageHeight: PAGE_H, fields: cur.fields },
      layout: { signatures, contentEnd, lastSection },
    };
  }

  /**
   * Compone la hoja entera menos firmas y pie. Con `breakAt` esa sección (o
   * ese ítem de la sección) arranca en hoja nueva. Devuelve, si las firmas no
   * caben al final, dónde habría que pasar de hoja para que vayan juntas.
   */
  private compose(input: PdfInput, data: FormatData, revision: number | undefined, breakAt: PageBreak | null) {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 0,
      autoFirstPage: false,
      bufferPages: true,
      info: { Title: `${input.title} - ${input.eventName}`, Author: 'Arta Producciones' },
    });

    const cur: Cursor = {
      doc,
      page: -1,
      y: TOP,
      accent: input.entity === 'EXPLANADA' ? GREEN : GOLD,
      fields: [],
      input,
      logo: brandAsset('arta-logo-ink.png'),
      footer: brandAsset('arta-footer.png'),
      revisionLabel: revision === undefined ? '' : `Rev. ${revision}`,
      isDraft: input.watermark ?? !/^(aprobado|sellado)$/i.test(String(input.statusLabel || '').trim()),
      section: -1,
      itemStarts: [],
      breakAt,
    };

    // La primera página lleva el logo, el título del formato y la línea del
    // evento; la cabecera genérica del servicio de marca no sustituye eso.
    this.newPage(cur, true);

    let lastIndex: number | null = null;
    let lastSection: Mark | null = null;
    for (let index = 0; index < data.sections.length; index += 1) {
      const section = data.sections[index];
      if (section.id === SIGNATURES_SECTION_ID) continue;
      if (!section.items.length) continue;
      const isHeader = section.layout === 'header' || section.id === HEADER_SECTION_ID;
      if (!isHeader && !section.items.some((i) => i.type !== 'signature')) continue;
      cur.section = index;
      cur.itemStarts = [];
      if (breakAt?.section === index && breakAt.item === null) this.newPage(cur);
      // El mismo mínimo que pide el título de sección: así el inicio que se
      // anota es donde de verdad empieza, no el final de la hoja anterior.
      else if (!isHeader) this.ensure(cur, 40);
      lastIndex = index;
      lastSection = { page: cur.page, y: cur.y };
      if (isHeader) this.drawHeaderSection(cur, section);
      else this.drawSection(cur, section);
    }

    let keepWithSignatures: PageBreak | null = null;
    const fits = cur.y + SIGN_H <= BOTTOM;
    if (!fits && breakAt === null && lastIndex !== null && lastSection) {
      const canCarry = (start: Mark) =>
        start.page === cur.page && // empieza en la última hoja (no la cruza)
        start.y > CONTINUATION_TOP + 1 && // no está ya al principio de una hoja
        cur.y - start.y + SIGN_H <= BOTTOM - CONTINUATION_TOP; // y cabe junto a las firmas
      if (canCarry(lastSection)) {
        keepWithSignatures = { section: lastIndex, item: null };
      } else {
        // La última sección cruza de hoja: se lleva con las firmas su último tramo.
        const tail = [...cur.itemStarts].reverse().find((start) => start.item > 0 && canCarry(start));
        if (tail) keepWithSignatures = { section: lastIndex, item: tail.item };
      }
    }

    return { cur, lastSection, keepWithSignatures };
  }

  /* ── Páginas ──────────────────────────────────────────────────────────── */

  private newPage(cur: Cursor, first = false) {
    const { doc, input } = cur;
    doc.addPage({ size: 'LETTER', margin: 0 });
    cur.page += 1;
    if (cur.isDraft) this.branding.draftWatermark(doc);

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
      const folio = cur.input.folio ? `Folio ${cur.input.folio} · ` : '';
      doc.text(`${folio}Formato generado en el sistema ARTA · sin validez sin firmas`, M, PAGE_H - 30 - 18, {
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

    // Texto fijo: varios párrafos seguidos son las viñetas del documento.
    const bullets = items.filter((i) => isParagraphType(i.type)).length > 1;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (cur.breakAt?.section === cur.section && cur.breakAt.item === index) this.newPage(cur);
      cur.itemStarts.push({ item: index, page: cur.page, y: cur.y });
      if (isParagraphType(item.type)) {
        this.drawParagraph(cur, item, bullets);
      } else if (isCheckType(item.type)) {
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
      } else if (item.type === 'attachment' && item.multiple) {
        this.drawGallery(cur, section, item);
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

  /**
   * Galería de fotos y videos (Recorrido de seguridad): la etiqueta con cuántos
   * hay y una rejilla de miniaturas. La foto (JPG/PNG) se imprime; video, HEIC
   * o link van como recuadro con su nombre, y cada recuadro abre el archivo.
   */
  private drawGallery(cur: Cursor, section: FormatSection, item: FormatItem) {
    const { doc, input } = cur;
    const files = attachmentFiles(item);
    const media = input.media ?? {};
    const cols = 4;
    const gap = 8;
    const tileW = (W - gap * (cols - 1)) / cols;
    const imgH = Math.round(tileW * 0.72);
    const captionH = 21;
    const rowH = imgH + captionH + 6;

    // Etiqueta y resumen, como un dato más del formato.
    const label = `${upper(item.label)}:`;
    this.ensure(cur, 18 + (files.length ? rowH : 0));
    const y = cur.y;
    doc.font(BOLD).fontSize(7.5).fillColor(MUTED);
    const labelW = Math.min(doc.widthOfString(label) + 2, W * 0.55);
    doc.text(this.fit(doc, label, 7.5, labelW), M, y + 2.5, { width: labelW + 4, lineBreak: false });
    const valueX = M + labelW + 6;
    const valueW = RIGHT - valueX;
    if (files.length) {
      doc.font(FONT).fontSize(9.5).fillColor(INK);
      doc.text(this.fit(doc, gallerySummary(files), 9.5, valueW), valueX, y, { width: valueW + 4, lineBreak: false });
    } else {
      doc.font(ITALIC).fontSize(8).fillColor(MUTED);
      doc.text(this.fit(doc, 'Sin fotos ni videos (se suben desde el formato en el sistema)', 8, valueW), valueX, y + 1, {
        width: valueW + 4,
        lineBreak: false,
      });
    }
    doc.moveTo(valueX, y + 12).lineTo(RIGHT, y + 12).lineWidth(0.6).strokeColor(LINE).stroke();
    cur.fields.push({ sectionId: section.id, itemId: item.id, type: 'value', page: cur.page, x: valueX, y: y - 1, w: valueW, h: 13 });
    cur.y += 18;
    if (!files.length) return;

    let printed = 0;
    let skipped = 0;
    files.forEach((file, index) => {
      const col = index % cols;
      if (col === 0) this.ensure(cur, rowH);
      const x = M + col * (tileW + gap);
      const top = cur.y;
      const m = file.fileId ? media[file.fileId] : undefined;
      const url = m?.url || file.url || '';
      const name = safe(m?.name || file.name || url.split('/').pop() || 'Archivo').trim();
      const kind = mediaKind({ mimeType: m?.mimeType || file.mimeType, name, url, fileId: file.fileId });
      const deleted = !!m?.deleted;

      let drewImage = false;
      if (kind === 'image' && m?.path && !deleted && /\.(jpe?g|png)$/i.test(m.path)) {
        if (printed >= GALLERY_MAX_PRINTED) {
          skipped += 1;
        } else {
          let size = m.sizeBytes ?? 0;
          try {
            size = size || statSync(m.path).size;
          } catch {
            size = 0;
          }
          if (size && size <= GALLERY_MAX_IMAGE_BYTES) {
            try {
              doc.rect(x, top, tileW, imgH).fillColor(SOFT).fill();
              doc.image(m.path, x, top, { fit: [tileW, imgH], align: 'center', valign: 'center' });
              drewImage = true;
              printed += 1;
            } catch {
              // Una foto dañada no tumba el PDF: queda el recuadro con su nombre.
            }
          }
        }
      }
      if (!drewImage) {
        const dark = kind === 'video';
        doc.rect(x, top, tileW, imgH).fillColor(dark ? '#1b1b1f' : SOFT).fill();
        const cx = x + tileW / 2;
        const cy = top + imgH / 2 - 6;
        if (kind === 'video') {
          doc.circle(cx, cy, 13).fillColor('#ffffff').fill();
          doc.polygon([cx - 4, cy - 7], [cx - 4, cy + 7], [cx + 7, cy]).fillColor('#1b1b1f').fill();
        }
        const ext = (name.split('.').pop() || '').toUpperCase().slice(0, 6);
        const tag = kind === 'video' ? 'VIDEO' : kind === 'link' ? 'LINK' : kind === 'image' ? `FOTO${ext ? ` ${ext}` : ''}` : ext || 'ARCHIVO';
        doc.font(BOLD).fontSize(7).fillColor(dark ? '#e7e7ea' : MUTED);
        doc.text(deleted ? 'BORRADO' : tag, x, kind === 'video' ? cy + 18 : cy + 2, { width: tileW, align: 'center', lineBreak: false });
      }
      doc.rect(x, top, tileW, imgH).lineWidth(0.5).strokeColor(LINE).stroke();

      // Pie: nombre y, si se sabe, hora en que se subió y peso.
      doc.font(FONT).fontSize(7).fillColor(INK);
      doc.text(this.fit(doc, name, 7, tileW), x, top + imgH + 3, { width: tileW + 2, lineBreak: false });
      const meta = [fmtTime(file.at), fmtSize(m?.sizeBytes ?? file.sizeBytes)].filter(Boolean).join(' · ');
      if (meta) {
        doc.font(FONT).fontSize(6.5).fillColor(MUTED);
        doc.text(this.fit(doc, meta, 6.5, tileW), x, top + imgH + 12, { width: tileW + 2, lineBreak: false });
      }

      const abs = /^https?:\/\//i.test(url) ? url : url && input.linkBase ? `${input.linkBase}${url}` : '';
      if (abs && !deleted) doc.link(x, top, tileW, imgH + captionH, abs);

      if (col === cols - 1 || index === files.length - 1) cur.y += rowH;
    });

    if (skipped) {
      this.ensure(cur, 14);
      doc.font(ITALIC).fontSize(7.5).fillColor(MUTED);
      const note = `Se imprimen ${printed} fotos; las otras ${skipped} están en el formato dentro del sistema.`;
      doc.text(this.fit(doc, note, 7.5, W), M, cur.y, { width: W + 4, lineBreak: false });
      cur.y += 14;
    }
    cur.y += 4;
  }

  /** Texto fijo del documento (condiciones, aceptación), tal cual; con viñeta si son varios. */
  private drawParagraph(cur: Cursor, item: FormatItem, bullet: boolean) {
    const { doc } = cur;
    const size = 8.8;
    const lineH = 11.5;
    const indent = bullet ? 12 : 0;
    doc.font(FONT).fontSize(size);
    const lines = this.wrap(doc, safe(item.label).trim(), size, W - indent);
    lines.forEach((line, i) => {
      this.ensure(cur, lineH);
      if (i === 0 && bullet) doc.circle(M + 3.5, cur.y + 4.2, 1.5).fillColor(cur.accent).fill();
      doc.font(FONT).fontSize(size).fillColor(INK);
      doc.text(line, M + indent, cur.y, { width: W - indent + 4, lineBreak: false });
      cur.y += lineH;
    });
    cur.y += bullet ? 3 : 5;
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
    const baseHeadH = 17;
    const baseRowH = 16;
    const headLineH = 8;
    const cellLineH = 10;
    const pad = 4;
    const weights = columns.map((c) => Math.max(0.5, c.width ?? 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalWeight) * W);
    const xs: number[] = [M];
    widths.forEach((w) => xs.push(xs[xs.length - 1] + w));
    const totals = columns.map((c) => (c.total ? columnTotal(item, c.id) : null));
    const hasTotals = columns.some((c) => c.total);
    const isNumeric = (c: FormatColumn) => c.type === 'number' || c.type === 'money';

    /*
     * Lo escrito en una celda se imprime completo: el texto que no cabe a lo
     * ancho baja de renglón y la fila crece (antes se cortaba con «...» y en
     * el papel se perdía media actividad). Los números siguen en una línea.
     */
    const cellLines = (text: string, c: FormatColumn, width: number, size: number, max: number): string[] => {
      if (isNumeric(c)) return [this.fit(doc, text, size, width)];
      const all = this.wrap(doc, text, size, width);
      if (all.length <= max) return all;
      const kept = all.slice(0, max);
      kept[max - 1] = this.fit(doc, `${kept[max - 1]} ${all.slice(max).join(' ')}`, size, width);
      return kept;
    };

    doc.font(BOLD);
    const headLines = columns.map((c, i) => cellLines(upper(c.label), c, widths[i] - pad * 2, 7, 3));
    const headH = baseHeadH + (Math.max(...headLines.map((l) => l.length)) - 1) * headLineH;

    const label = section.items.length > 1 || section.title !== item.label ? upper(item.label) : '';
    if (label) {
      this.ensure(cur, 14 + headH + baseRowH * 2);
      doc.font(BOLD).fontSize(7.5).fillColor(MUTED);
      doc.text(`${label}:`, M, cur.y, { width: W, lineBreak: false });
      cur.y += 12;
    } else {
      this.ensure(cur, headH + baseRowH * 2);
    }

    const drawHead = () => {
      doc.rect(M, cur.y, W, headH).fillColor(SOFT).fill();
      doc.rect(M, cur.y, W, headH).lineWidth(0.6).strokeColor(INK).stroke();
      doc.font(BOLD).fontSize(7).fillColor(INK);
      columns.forEach((c, i) => {
        headLines[i].forEach((line, n) => {
          doc.text(line, xs[i] + pad, cur.y + 5.5 + n * headLineH, {
            width: widths[i] - pad * 2 + 2,
            align: isNumeric(c) ? 'right' : 'left',
            lineBreak: false,
          });
        });
      });
      cur.y += headH;
    };

    drawHead();
    for (let r = 0; r < count; r += 1) {
      const row = rows[r];
      doc.font(FONT);
      const lines = columns.map((c, i) => {
        if (!row) return [];
        const raw = row[c.id];
        const textValue = c.type === 'date' ? dateDisplay(raw) : cellDisplay(c, raw);
        return textValue ? cellLines(textValue, c, widths[i] - pad * 2, 8.5, 6) : [];
      });
      const rowH = baseRowH + (Math.max(1, ...lines.map((l) => l.length)) - 1) * cellLineH;
      if (cur.y + rowH > BOTTOM) {
        this.newPage(cur);
        drawHead();
      }
      const top = cur.y;
      doc.rect(M, top, W, rowH).lineWidth(0.4).strokeColor(LINE).stroke();
      xs.slice(1, -1).forEach((x) => doc.moveTo(x, top).lineTo(x, top + rowH).lineWidth(0.4).strokeColor(LINE).stroke());
      doc.font(FONT).fontSize(8.5).fillColor(INK);
      columns.forEach((c, i) => {
        lines[i].forEach((line, n) => {
          doc.text(line, xs[i] + pad, top + 4.5 + n * cellLineH, {
            width: widths[i] - pad * 2 + 2,
            align: isNumeric(c) ? 'right' : 'left',
            lineBreak: false,
          });
        });
      });
      cur.y += rowH;
    }

    if (hasTotals) {
      const rowH = baseRowH;
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

  /**
   * Renglones de firma al final del documento, como en un Word impreso: el
   * trazo encima de la línea y debajo el nombre, a quién corresponde (con el
   * nombre propio de cada formato: «Producción externa», «Auditorio Explanada
   * Puebla»…) y la fecha. Sin recuadros ni título aparte: es parte de la hoja.
   */
  private drawSignatures(cur: Cursor): { page: number; y: number } {
    const { input } = cur;
    this.ensure(cur, SIGN_H);
    const at = { page: cur.page, y: cur.y };
    const top = cur.y + SIGN_GAP;
    const gap = 40;
    const colW = (W - gap) / 2;
    const labels = signatureLabels(input.data);
    this.drawSignatureLine(cur, M, top, colW, labels.delivered, input.delivered);
    this.drawSignatureLine(cur, M + colW + gap, top, colW, labels.authorized, input.authorized);
    cur.y += SIGN_H;
    return at;
  }

  private drawSignatureLine(
    cur: Cursor,
    x: number,
    y: number,
    width: number,
    label: string,
    sig?: SignaturePayload | null,
  ) {
    const { doc } = cur;
    const img = dataUrlToBuffer(sig?.imageDataUrl);
    if (img) {
      try {
        doc.image(img, x + 14, y, { fit: [width - 28, SIGN_IMG_H], align: 'center', valign: 'bottom' });
      } catch {
        // Una imagen dañada no tumba el PDF: queda el renglón para firmar a mano.
      }
    }
    const lineY = y + SIGN_IMG_H + 4;
    doc.moveTo(x, lineY).lineTo(x + width, lineY).lineWidth(0.7).strokeColor(INK).stroke();

    const name = safe(sig?.signerName).trim();
    doc.font(FONT).fontSize(8.8).fillColor(name ? INK : MUTED);
    doc.text(this.fit(doc, name || 'Nombre y firma', 8.8, width), x, lineY + 4, {
      width,
      align: 'center',
      lineBreak: false,
    });
    doc.font(BOLD).fontSize(7.2).fillColor(INK);
    doc.text(this.fit(doc, upper(label), 7.2, width), x, lineY + 16, { width, align: 'center', lineBreak: false });
    const when = sig?.signedAt ? new Date(sig.signedAt) : null;
    const date = when && !Number.isNaN(when.getTime()) ? fmtDateTime(when) : '';
    doc.font(FONT).fontSize(7).fillColor(MUTED);
    doc.text(date ? `Fecha: ${safe(date)}` : 'Fecha: ______________________', x, lineY + 27, {
      width,
      align: 'center',
      lineBreak: false,
    });
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
    const media = await this.galleryMedia(item.eventId, data);

    const shortId = item.event.id.replace(/-/g, '').slice(0, 6).toUpperCase();
    const folio = `ARTA-${shortId}-${(item.template?.key || item.title || 'FORMATO').toString().toUpperCase()}-V${item.revision ?? 1}`;

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
        folio,
        media,
        linkBase: panelOrigin(item.event.entity),
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

  /**
   * Los archivos de las galerías del formato, solo de ESTE evento (un `fileId`
   * de otro evento escrito a mano en el JSON no se imprime).
   */
  async galleryMedia(eventId: string, data: FormatData): Promise<Record<string, PdfMedia>> {
    const ids = new Set<string>();
    for (const section of data.sections) {
      for (const it of section.items) {
        if (it.type !== 'attachment' || !it.multiple) continue;
        for (const f of attachmentFiles(it)) if (f.fileId) ids.add(f.fileId);
      }
    }
    if (!ids.size) return {};
    const rows = await this.prisma.eventFile.findMany({
      where: { id: { in: [...ids] }, eventId },
      select: { id: true, url: true, fileName: true, mimeType: true, sizeBytes: true, deletedAt: true },
    });
    return Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          path: r.deletedAt ? null : this.resolveUploadPath(r.url),
          url: r.url,
          name: r.fileName,
          mimeType: r.mimeType,
          sizeBytes: r.sizeBytes,
          deleted: !!r.deletedAt,
        },
      ]),
    );
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
