/**
 * PDFs de campaña (junta 11-09-2026): «generar 2 PDFs diferentes e
 * independientes (interna y externa)» y el de la campaña de convenios.
 *
 * Mismo encabezado que el Excel de Arta — PROMOTOR | EVENTO, FECHA | VENUE,
 * HORARIO | CIUDAD — y una tabla que pagina sola si hay muchos conceptos.
 */
import type { PDFPage } from 'pdf-lib';
import type { CampaignConceptRow, ConvenioRow } from '@/components/events/event-detail.types';
import {
  campaignTotals,
  cleanCampaignRows,
  cleanConvenioRows,
  conceptLineTotal,
  convenioLineTotal,
  convenioZones,
  conveniosTotal,
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

type Col = { title: string; width: number; align?: 'left' | 'right' };

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

  row(cols: Col[], cells: string[]) {
    const { kit } = this;
    const size = 8.8;
    const wrapped = cols.map((c, i) =>
      c.align === 'right' ? [pdfSafe(cells[i] || '')] : wrapText(cells[i] || '', kit.regular, size, c.width - 14).slice(0, 5),
    );
    const lines = Math.max(1, ...wrapped.map((w) => w.length));
    const height = lines * 11 + 9;
    if (this.y - height < BOTTOM) {
      this.newPage(false);
      this.tableHead(cols);
    }
    let x = MARGIN;
    cols.forEach((c, i) => {
      wrapped[i].forEach((line, li) => {
        const yy = this.y - 9 - li * 11;
        if (c.align === 'right') drawRight(this.page, line, x + c.width - 7, yy, size, kit.regular, kit.colors.ink);
        else this.page.drawText(line, { x: x + 7, y: yy, size, font: i === 0 ? kit.bold : kit.regular, color: kit.colors.ink });
      });
      x += c.width;
    });
    this.y -= height;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 2 },
      end: { x: MARGIN + WIDTH, y: this.y + 2 },
      thickness: 0.4,
      color: kit.colors.line,
    });
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

/** Campaña interna (precio interno) o externa (precio externo): dos PDFs distintos. */
export async function buildCampaignPdf({
  event,
  rows,
  kind,
}: {
  event: CampaignPdfEvent;
  rows: CampaignConceptRow[];
  kind: 'interna' | 'externa';
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
  sheet.totals([{ label: 'TOTAL', value: pdfMoney(totals[field]), strong: true }]);
  sheet.finish();
  return savePdf(kit);
}

export async function buildConveniosPdf({
  event,
  rows,
}: {
  event: CampaignPdfEvent;
  rows: ConvenioRow[];
}): Promise<Blob> {
  const kit = await createPdfKit();
  const sheet = new Sheet(kit, { eyebrow: 'CAMPAÑA DE CONVENIOS', title: 'Convenios', event });
  const clean = cleanConvenioRows(rows);
  const cols: Col[] = [
    { title: 'CONVENIO', width: 112 },
    { title: 'DESCRIPCIÓN', width: 172 },
    { title: 'ZONA', width: 62 },
    { title: 'CANT.', width: 40, align: 'right' },
    { title: 'PRECIO', width: 60, align: 'right' },
    { title: 'TOTAL', width: 70, align: 'right' },
  ];
  sheet.tableHead(cols);
  if (!clean.length) sheet.empty('Sin convenios capturados.');
  for (const r of clean) {
    sheet.row(cols, [
      r.concept,
      r.description || '',
      (r.zona || '').toUpperCase(),
      r.qty == null ? '' : String(r.qty),
      money(r.price ?? null),
      money(convenioLineTotal(r)),
    ]);
  }
  sheet.totals([{ label: 'TOTAL', value: pdfMoney(conveniosTotal(clean)), strong: true }]);

  const zones = convenioZones(clean);
  if (zones.length) {
    sheet.section('CORTESÍAS POR ZONA');
    const zoneCols: Col[] = [
      { title: 'ZONA', width: 260 },
      { title: 'BOLETOS', width: 120, align: 'right' },
      { title: 'VALOR', width: 136, align: 'right' },
    ];
    sheet.tableHead(zoneCols);
    for (const z of zones) sheet.row(zoneCols, [z.zona.toUpperCase(), String(z.qty), pdfMoney(z.total)]);
  }
  sheet.finish();
  return savePdf(kit);
}

export function campaignPdfName(eventName: string, kind: 'interna' | 'externa') {
  return `CAMPANA-${kind.toUpperCase()}-${fileSlug(eventName, 'evento')}.pdf`;
}

export function conveniosPdfName(eventName: string) {
  return `CONVENIOS-${fileSlug(eventName, 'evento')}.pdf`;
}
