/**
 * PDFs de campaña (junta 11-09-2026): «generar 2 PDFs diferentes e
 * independientes (interna y externa)» y los de la campaña de convenios, que
 * desde el 23-10-2026 también son dos: interno (con precio y total) y externo
 * (sin un solo monto).
 *
 * Mismo encabezado que el Excel de Arta — PROMOTOR | EVENTO, FECHA | VENUE,
 * HORARIO | CIUDAD — y una tabla que pagina sola si hay muchos conceptos.
 */
import type { PDFPage } from 'pdf-lib';
import type { CampaignConceptRow, CampaignFinalNote, ConvenioRow } from '@/components/events/event-detail.types';
import {
  campaignTotals,
  cleanCampaignRows,
  cleanConvenioRows,
  cleanFinalNotes,
  conceptLineTotal,
  convenioZoneTotal,
  convenioZones,
  convenioZonesOf,
  conveniosTotal,
  finalNoteWhen,
} from './campaign-concepts';
import {
  LETTER,
  createPdfKit,
  drawLogo,
  drawRight,
  fileSlug,
  pdfMoney,
  pdfSafe,
  savePdf,
  wrapText,
  type PdfKit,
} from './pdf-kit';

export type CampaignPdfEvent = {
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
  schedule?: string | null;
  venue?: string | null;
  city?: string | null;
  promoter?: string | null;
};

const MARGIN = 48;
const WIDTH = LETTER[0] - MARGIN * 2;
const BOTTOM = 70;
const CELL_SIZE = 8.8;

export type Col = { title: string; width: number; align?: 'left' | 'right' };

function longDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «29 DE OCTUBRE AL 2 DE NOVIEMBRE DE 2026». */
export function dateRangeUpper(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt) return '—';
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  if (end && !Number.isNaN(end.getTime()) && end.toDateString() !== start.toDateString()) {
    return `${longDate(startsAt)} al ${longDate(endsAt)}`.toUpperCase();
  }
  return longDate(startsAt).toUpperCase();
}

function shortDay(value?: string | null) {
  if (!value) return '';
  const d = new Date(value.length === 10 ? `${value}T00:00` : value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function range(from?: string | null, to?: string | null) {
  const a = shortDay(from);
  const b = shortDay(to);
  if (a && b && a !== b) return `${a} - ${b}`;
  return a || b || '';
}

type Head = { eyebrow: string; title: string; event: CampaignPdfEvent };

class Sheet {
  page!: PDFPage;
  y = 0;

  constructor(
    readonly kit: PdfKit,
    readonly head: Head,
  ) {
    this.newPage(true);
  }

  newPage(first: boolean) {
    this.page = this.kit.pdf.addPage(LETTER);
    this.y = first ? this.fullHeader() : this.miniHeader();
  }

  private fullHeader() {
    const { page, kit, head } = this;
    const { ink, muted, gold } = kit.colors;
    const top = LETTER[1] - 46;
    drawLogo(kit, page, MARGIN, top, 30);
    drawRight(page, head.eyebrow, MARGIN + WIDTH, top - 8, 7.5, kit.bold, gold);
    drawRight(page, head.title, MARGIN + WIDTH, top - 30, 19, kit.bold, ink);
    let y = top - 46;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + WIDTH, y }, thickness: 1.1, color: gold });
    y -= 22;
    const e = head.event;
    const grid: Array<Array<[string, string]>> = [
      [
        ['PROMOTOR', e.promoter || 'ARTA PRODUCCIONES'],
        ['EVENTO', e.name],
      ],
      [
        ['FECHA', dateRangeUpper(e.startsAt, e.endsAt)],
        ['VENUE', e.venue || '—'],
      ],
      [
        ['HORARIO', e.schedule || '—'],
        ['CIUDAD', e.city || '—'],
      ],
    ];
    const colW = WIDTH / 2;
    for (const row of grid) {
      row.forEach(([label, value], i) => {
        const x = MARGIN + i * colW;
        page.drawText(label, { x, y, size: 6.6, font: kit.bold, color: muted });
        wrapText(value.toUpperCase(), kit.regular, 9.5, colW - 18)
          .slice(0, 2)
          .forEach((line, li) => page.drawText(line, { x, y: y - 12.5 - li * 11.5, size: 9.5, font: kit.regular, color: ink }));
      });
      y -= 36;
    }
    return y - 2;
  }

  private miniHeader() {
    const { page, kit, head } = this;
    const top = LETTER[1] - 42;
    page.drawText(pdfSafe(`${head.title} · ${head.event.name}`.toUpperCase()), {
      x: MARGIN,
      y: top,
      size: 8,
      font: kit.bold,
      color: kit.colors.muted,
    });
    page.drawLine({
      start: { x: MARGIN, y: top - 8 },
      end: { x: MARGIN + WIDTH, y: top - 8 },
      thickness: 0.6,
      color: kit.colors.line,
    });
    return top - 26;
  }

  tableHead(cols: Col[]) {
    const { page, kit } = this;
    page.drawRectangle({ x: MARGIN, y: this.y - 20, width: WIDTH, height: 22, color: kit.colors.soft });
    let x = MARGIN;
    for (const c of cols) {
      if (c.align === 'right') drawRight(page, c.title, x + c.width - 7, this.y - 12, 6.6, kit.bold, kit.colors.muted);
      else page.drawText(c.title, { x: x + 7, y: this.y - 12, size: 6.6, font: kit.bold, color: kit.colors.muted });
      x += c.width;
    }
    this.y -= 26;
  }

  private wrapCell(c: Col, text: string, maxLines = 5) {
    return c.align === 'right' ? [pdfSafe(text)] : wrapText(text, this.kit.regular, CELL_SIZE, c.width - 14).slice(0, maxLines);
  }

  private static heightOf(wrapped: string[][]) {
    return Math.max(1, ...wrapped.map((w) => w.length)) * 11 + 9;
  }

  /** Pinta las celdas `wrapped` en las columnas desde `first`, con su borde superior en `top`. */
  private drawCells(cols: Col[], first: number, wrapped: string[][], top: number) {
    const { kit } = this;
    let x = MARGIN + cols.slice(0, first).reduce((s, c) => s + c.width, 0);
    wrapped.forEach((lines, k) => {
      const i = first + k;
      const c = cols[i];
      lines.forEach((line, li) => {
        const yy = top - 9 - li * 11;
        if (c.align === 'right') drawRight(this.page, line, x + c.width - 7, yy, CELL_SIZE, kit.regular, kit.colors.ink);
        else this.page.drawText(line, { x: x + 7, y: yy, size: CELL_SIZE, font: i === 0 ? kit.bold : kit.regular, color: kit.colors.ink });
      });
      x += c.width;
    });
  }

  private divider(y: number, fromX = MARGIN, strong = false) {
    this.page.drawLine({
      start: { x: fromX, y },
      end: { x: MARGIN + WIDTH, y },
      thickness: strong ? 0.4 : 0.25,
      color: this.kit.colors.line,
    });
  }

  row(cols: Col[], cells: string[]) {
    const wrapped = cols.map((c, i) => this.wrapCell(c, cells[i] || ''));
    const height = Sheet.heightOf(wrapped);
    if (this.y - height < BOTTOM) {
      this.newPage(false);
      this.tableHead(cols);
    }
    this.drawCells(cols, 0, wrapped, this.y);
    this.y -= height;
    this.divider(this.y + 2, MARGIN, true);
  }

  /**
   * Un renglón con varias líneas: las primeras `lead.length` columnas (el
   * convenio y su descripción) se pintan una vez y abarcan todas las líneas
   * (las zonas). Si el grupo no cabe, pasa entero a la hoja siguiente; si ni
   * así cabe, se parte y el convenio se repite con «(cont.)».
   */
  group(cols: Col[], lead: string[], lines: string[][]) {
    const leadWrapped = lead.map((t, i) => this.wrapCell(cols[i], t, 8));
    const leadH = Sheet.heightOf(leadWrapped);
    const rest = cols.slice(lead.length);
    const body = (lines.length ? lines : [rest.map(() => '')]).map((cells) =>
      rest.map((c, j) => this.wrapCell(c, cells[j] || '')),
    );
    const heights = body.map((w) => Sheet.heightOf(w));
    const need = Math.max(leadH, heights.reduce((a, b) => a + b, 0));
    // Lo que cabe en una hoja de continuación (encabezado corto + títulos de la tabla).
    const freshRoom = LETTER[1] - 68 - 26 - BOTTOM;
    const fitsHere = this.y - need >= BOTTOM;
    const startsHere = this.y - Math.max(leadH, heights[0]) >= BOTTOM;
    // Pasa entero a la hoja siguiente si ahí cabe; si es más largo que una hoja, empieza aquí.
    if (!fitsHere && (need <= freshRoom || !startsHere)) {
      this.newPage(false);
      this.tableHead(cols);
    }
    const restX = MARGIN + cols.slice(0, lead.length).reduce((s, c) => s + c.width, 0);
    let top = this.y;
    let leadBottom = top - leadH;
    this.drawCells(cols, 0, leadWrapped, top);
    body.forEach((wrapped, k) => {
      if (top - heights[k] < BOTTOM) {
        this.divider(Math.min(top, leadBottom) + 2, MARGIN, true);
        this.newPage(false);
        this.tableHead(cols);
        top = this.y;
        const cont = this.wrapCell(cols[0], `${lead[0] || ''} (cont.)`, 2);
        this.drawCells(cols, 0, [cont], top);
        leadBottom = top - Sheet.heightOf([cont]);
      }
      this.drawCells(cols, lead.length, wrapped, top);
      top -= heights[k];
      if (k < body.length - 1) this.divider(top + 2, restX);
    });
    this.y = Math.min(top, leadBottom);
    this.divider(this.y + 2, MARGIN, true);
  }

  /** Notas finales: la fecha (o el rango) en negritas y el texto debajo. */
  notes(title: string, items: Array<{ when: string; text: string }>) {
    if (!items.length) return;
    const { kit } = this;
    const size = 9;
    const lead = 12.5;
    this.section(title);
    for (const it of items) {
      const lines = [
        ...(it.when ? wrapText(it.when, kit.bold, size, WIDTH).map((t) => ({ t, font: kit.bold })) : []),
        ...(it.text ? wrapText(it.text, kit.regular, size, WIDTH).map((t) => ({ t, font: kit.regular })) : []),
      ];
      const height = lines.length * lead + 8;
      if (this.y - height < BOTTOM) {
        this.newPage(false);
        this.section(title);
      }
      lines.forEach((line, i) =>
        this.page.drawText(line.t, { x: MARGIN, y: this.y - 10 - i * lead, size, font: line.font, color: kit.colors.ink }),
      );
      this.y -= height;
    }
  }

  empty(text: string) {
    this.page.drawText(pdfSafe(text), { x: MARGIN + 7, y: this.y - 12, size: 9, font: this.kit.italic, color: this.kit.colors.muted });
    this.y -= 26;
  }

  totals(items: Array<{ label: string; value: string; strong?: boolean }>) {
    const need = items.length * 18 + 30;
    if (this.y - need < BOTTOM) this.newPage(false);
    const { page, kit } = this;
    this.y -= 10;
    page.drawLine({
      start: { x: MARGIN + WIDTH - 230, y: this.y },
      end: { x: MARGIN + WIDTH, y: this.y },
      thickness: 1,
      color: kit.colors.gold,
    });
    this.y -= 18;
    for (const it of items) {
      drawRight(page, it.label, MARGIN + WIDTH - 120, this.y, 7.2, kit.bold, kit.colors.muted);
      drawRight(page, it.value, MARGIN + WIDTH, this.y - (it.strong ? 1 : 0), it.strong ? 13 : 10, kit.bold, kit.colors.ink);
      this.y -= it.strong ? 22 : 16;
    }
  }

  space(points: number) {
    this.y -= points;
  }

  section(title: string) {
    if (this.y - 60 < BOTTOM) this.newPage(false);
    this.y -= 10;
    this.page.drawText(pdfSafe(title), { x: MARGIN, y: this.y, size: 7.5, font: this.kit.bold, color: this.kit.colors.gold });
    this.y -= 14;
  }

  finish() {
    const pages = this.kit.pdf.getPages();
    const stamp = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    pages.forEach((p, i) => {
      p.drawText(pdfSafe(`Arta Producciones  ·  #LaExperienciadelShow  ·  ${stamp}`), {
        x: MARGIN,
        y: 34,
        size: 7,
        font: this.kit.regular,
        color: this.kit.colors.muted,
      });
      drawRight(p, `${i + 1} / ${pages.length}`, MARGIN + WIDTH, 34, 7, this.kit.regular, this.kit.colors.muted);
    });
  }
}

const money = (n: number | null) => (n == null ? '' : pdfMoney(n));

/** Con su signo: un ahorro negativo se imprime «-$1,200.00», nunca se esconde. */
const signedMoney = (n: number) => (n < 0 ? `-${pdfMoney(-n)}` : pdfMoney(n));

function finalNoteItems(notes?: CampaignFinalNote[] | null) {
  return cleanFinalNotes(notes).map((n) => ({ when: finalNoteWhen(n), text: n.text }));
}

/**
 * Campaña interna (precio interno) o externa (precio externo): dos PDFs
 * distintos. Solo la interna lleva el total externo y el ahorro; las notas
 * finales salen en las dos.
 */
export async function buildCampaignPdf({
  event,
  rows,
  kind,
  finalNotes,
}: {
  event: CampaignPdfEvent;
  rows: CampaignConceptRow[];
  kind: 'interna' | 'externa';
  finalNotes?: CampaignFinalNote[] | null;
}): Promise<Blob> {
  const kit = await createPdfKit();
  const sheet = new Sheet(kit, {
    eyebrow: 'GASTOS DE PUBLICIDAD',
    title: kind === 'interna' ? 'Campaña interna' : 'Campaña externa',
    event,
  });
  const clean = cleanCampaignRows(rows);
  const field = kind === 'interna' ? 'interno' : 'externo';
  const cols: Col[] = [
    { title: 'CONCEPTO', width: 206 },
    { title: 'CANT.', width: 46, align: 'right' },
    { title: 'FECHAS', width: 88 },
    { title: 'COSTO', width: 80, align: 'right' },
    { title: 'COSTO TOTAL', width: 96, align: 'right' },
  ];
  sheet.tableHead(cols);
  if (!clean.length) sheet.empty('Sin conceptos capturados.');
  for (const r of clean) {
    const price = field === 'interno' ? r.precioInterno : r.precioExterno;
    sheet.row(cols, [
      r.concept,
      String(r.qty ?? 1),
      range(r.from, r.to),
      money(price ?? null),
      money(conceptLineTotal(r, field)),
    ]);
  }
  const totals = campaignTotals(clean);
  if (kind === 'interna') {
    sheet.totals([
      { label: 'TOTAL', value: pdfMoney(totals.interno), strong: true },
      { label: 'TOTAL EXTERNO', value: pdfMoney(totals.externo) },
      { label: 'AHORRO (EXTERNO - INTERNO)', value: signedMoney(totals.ahorro) },
    ]);
  } else {
    sheet.totals([{ label: 'TOTAL', value: pdfMoney(totals.externo), strong: true }]);
  }
  sheet.notes('NOTAS FINALES', finalNoteItems(finalNotes));
  sheet.finish();
  return savePdf(kit);
}

/** Columnas de cada PDF de convenios: el externo no lleva ni un peso. */
export function conveniosPdfColumns(kind: 'interno' | 'externo'): Col[] {
  if (kind === 'externo') {
    return [
      { title: 'CONVENIO', width: 130 },
      { title: 'DESCRIPCIÓN', width: 216 },
      { title: 'ZONA', width: 120 },
      { title: 'CANT.', width: 50, align: 'right' },
    ];
  }
  return [
    { title: 'CONVENIO', width: 104 },
    { title: 'DESCRIPCIÓN', width: 146 },
    { title: 'ZONA', width: 94 },
    { title: 'CANT.', width: 40, align: 'right' },
    { title: 'PRECIO', width: 62, align: 'right' },
    { title: 'TOTAL', width: 70, align: 'right' },
  ];
}

/**
 * Convenios (junta 23-10-2026): «un PDF interno y externo: que solo salgan
 * externo convenio, descripción, zona, cantidad; e interno todo eso más
 * precio y total». Cada convenio con todas sus zonas, una línea por zona.
 */
export async function buildConveniosPdf({
  event,
  rows,
  kind,
}: {
  event: CampaignPdfEvent;
  rows: ConvenioRow[];
  kind: 'interno' | 'externo';
}): Promise<Blob> {
  const internal = kind === 'interno';
  const kit = await createPdfKit();
  const sheet = new Sheet(kit, {
    eyebrow: 'CAMPAÑA DE CONVENIOS',
    title: internal ? 'Convenios internos' : 'Convenios externos',
    event,
  });
  const clean = cleanConvenioRows(rows);
  const cols = conveniosPdfColumns(kind);
  sheet.tableHead(cols);
  if (!clean.length) sheet.empty('Sin convenios capturados.');
  for (const r of clean) {
    const lines = convenioZonesOf(r).map((z) => {
      const base = [z.zona.toUpperCase(), z.qty == null ? '' : String(z.qty)];
      return internal ? [...base, money(z.price ?? null), money(convenioZoneTotal(z))] : base;
    });
    sheet.group(cols, [r.concept, r.description || ''], lines);
  }
  if (internal) sheet.totals([{ label: 'TOTAL', value: pdfMoney(conveniosTotal(clean)), strong: true }]);
  else sheet.space(16);

  const zones = convenioZones(clean);
  if (zones.length) {
    sheet.section('CORTESÍAS POR ZONA');
    const zoneCols: Col[] = internal
      ? [
          { title: 'ZONA', width: 260 },
          { title: 'BOLETOS', width: 120, align: 'right' },
          { title: 'VALOR', width: 136, align: 'right' },
        ]
      : [
          { title: 'ZONA', width: 380 },
          { title: 'BOLETOS', width: 136, align: 'right' },
        ];
    sheet.tableHead(zoneCols);
    for (const z of zones) {
      const cells = [z.zona.toUpperCase(), z.qty.toLocaleString('es-MX')];
      sheet.row(zoneCols, internal ? [...cells, pdfMoney(z.total)] : cells);
    }
  }
  sheet.finish();
  return savePdf(kit);
}

export function campaignPdfName(eventName: string, kind: 'interna' | 'externa') {
  return `CAMPANA-${kind.toUpperCase()}-${fileSlug(eventName, 'evento')}.pdf`;
}

export function conveniosPdfName(eventName: string, kind: 'interno' | 'externo') {
  return `CONVENIOS-${kind.toUpperCase()}-${fileSlug(eventName, 'evento')}.pdf`;
}
