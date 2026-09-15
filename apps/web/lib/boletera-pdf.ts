/**
 * «Creación de boletera» en PDF — el machote que Arta manda a la boletera
 * (junta 11-09-2026): carta blanca con margen amplio, datos del show, zonas
 * con aforo y precio, hold, carpeta de artes y descripción.
 *
 * `boleteraSheet` resuelve los valores una sola vez (con respaldo en los datos
 * del evento) para que el resumen del panel y el PDF digan exactamente lo mismo.
 */
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import { boleteraDateLabel, normalizeArtsUrl } from '@/lib/boletera';
import {
  LETTER,
  createPdfKit,
  downloadBlob,
  drawCentered,
  drawLogo,
  fileSlug,
  pdfSafe,
  savePdf,
  wrapText,
  type PdfKit,
} from '@/lib/pdf-kit';
import { parseTicketZones, ticketZonesCapacity, type TicketZone } from '@/lib/ticket-zones';

export type BoleteraPdfSetup = {
  boletera: string;
  zonesJson?: unknown;
  venue?: string | null;
  artsUrl?: string | null;
  dateLabel?: string | null;
  functions?: number | null;
  schedule?: string | null;
  description?: string | null;
  holdArtist?: number | null;
  holdPromoter?: number | null;
  holdVenue?: number | null;
};

export type BoleteraPdfEvent = {
  name: string;
  venue?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  schedule?: string | null;
  functions?: number | null;
  description?: string | null;
};

export type BoleteraSheet = {
  eventName: string;
  boletera: string;
  dateLabel: string;
  schedule: string;
  functions: number | null;
  venue: string;
  zones: TicketZone[];
  capacity: number;
  hold: { artist: number | null; promoter: number | null; venue: number | null };
  /** Tal como se capturó. */
  artsUrl: string;
  /** Link abrible, o '' si lo capturado no es una URL http(s). */
  artsHref: string;
  description: string;
};

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const t = (value ?? '').trim();
    if (t) return t;
  }
  return '';
}

function count(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** Valores finales del documento: lo capturado en la boletera y, si falta, lo del evento. */
export function boleteraSheet(setup: BoleteraPdfSetup, event: BoleteraPdfEvent): BoleteraSheet {
  const zones = parseTicketZones(setup.zonesJson).filter((z) => z.zona.trim());
  const functions = count(setup.functions) ?? count(event.functions);
  return {
    eventName: firstText(event.name),
    boletera: firstText(setup.boletera),
    dateLabel: firstText(setup.dateLabel, boleteraDateLabel(event.startsAt, event.endsAt)),
    schedule: firstText(setup.schedule, event.schedule),
    functions: functions && functions > 0 ? functions : null,
    venue: firstText(setup.venue, event.venue),
    zones,
    capacity: ticketZonesCapacity(zones),
    hold: {
      artist: count(setup.holdArtist),
      promoter: count(setup.holdPromoter),
      venue: count(setup.holdVenue),
    },
    artsUrl: firstText(setup.artsUrl),
    artsHref: normalizeArtsUrl(setup.artsUrl),
    description: firstText(setup.description, event.description),
  };
}

export function boleteraPdfFileName(eventName: string): string {
  return `BOLETERA-${fileSlug(eventName, 'evento')}.pdf`;
}

/* ── Dibujo ─────────────────────────────────────────────────────────────── */

const [PAGE_W, PAGE_H] = LETTER;
const LEFT = 72;
const RIGHT = PAGE_W - 72;
const AFORO_X = 310;
const PRECIO_X = 470;
const FOOTER_Y = 36;
const FOOTER = '#LaExperienciadelShow   |   www.artaproductions.com   |   Arta Producciones';
const MAX_ZONES = 16;

const upper = (text: string) => text.toLocaleUpperCase('es-MX');

/** Una línea que no se sale de `maxWidth`: si no cabe, se corta con «...». */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let safe = pdfSafe(text).replace(/\s+/g, ' ').trim();
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  while (safe.length > 1 && font.widthOfTextAtSize(`${safe}...`, size) > maxWidth) {
    safe = safe.slice(0, -1);
  }
  return `${safe.trimEnd()}...`;
}

/** Texto con tracking: letra por letra. */
function drawSpaced(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: RGB,
  tracking: number,
) {
  let cursor = x;
  for (const ch of pdfSafe(text)) {
    page.drawText(ch, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

/** «Etiqueta: valor» — etiqueta en negritas. */
function drawField(kit: PdfKit, page: PDFPage, label: string, value: string, y: number, valueFont: PDFFont) {
  const size = 10;
  const head = `${label}: `;
  page.drawText(pdfSafe(head), { x: LEFT, y, size, font: kit.bold, color: kit.colors.ink });
  const x = LEFT + kit.bold.widthOfTextAtSize(pdfSafe(head), size);
  if (!value) return;
  page.drawText(fit(value, valueFont, size, RIGHT - x), { x, y, size, font: valueFont, color: kit.colors.ink });
}

function underline(page: PDFPage, x: number, y: number, width: number, color: RGB, thickness = 0.6) {
  page.drawLine({ start: { x, y: y - 1.8 }, end: { x: x + width, y: y - 1.8 }, thickness, color });
}

const priceLabel = (n: number) =>
  `$ ${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Zona clicable sobre el link de la carpeta. */
function addLinkAnnotation(
  kit: PdfKit,
  lib: typeof import('pdf-lib'),
  page: PDFPage,
  href: string,
  rect: [number, number, number, number],
) {
  // Literal PDF: paréntesis y diagonal invertida van escapados.
  const escaped = href.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const annot = kit.pdf.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: rect,
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: lib.PDFString.of(escaped) },
  });
  page.node.addAnnot(kit.pdf.context.register(annot));
}

export async function buildBoleteraPdf({
  setup,
  event,
}: {
  setup: BoleteraPdfSetup;
  event: BoleteraPdfEvent;
}): Promise<Blob> {
  const kit = await createPdfKit();
  const lib = await import('pdf-lib');
  const boldItalic = await kit.pdf.embedFont(lib.StandardFonts.HelveticaBoldOblique);
  const sheet = boleteraSheet(setup, event);
  const { ink, muted, line, gold, link } = kit.colors;

  kit.pdf.setTitle(`Creación de boletera · ${sheet.eventName}`);
  kit.pdf.setAuthor('Arta Producciones');
  const page = kit.pdf.addPage(LETTER);

  // Marca: logo y «PRODUCCIONES» con tracking al ancho del logo.
  const logoTop = PAGE_H - 54;
  const logoH = 44;
  const logoW = drawLogo(kit, page, LEFT, logoTop, logoH);
  const brand = 'PRODUCCIONES';
  const brandSize = 7.5;
  const natural = kit.regular.widthOfTextAtSize(brand, brandSize);
  const tracking = Math.min(4, Math.max(1.2, (logoW - natural) / (brand.length - 1)));
  let y = logoTop - logoH - 13;
  drawSpaced(page, brand, LEFT, y, brandSize, kit.regular, ink, tracking);

  // Título.
  y -= 36;
  page.drawText(pdfSafe('CREACIÓN BOLETERA'), { x: LEFT, y, size: 11.5, font: kit.bold, color: ink });
  page.drawLine({ start: { x: LEFT, y: y - 7 }, end: { x: LEFT + 28, y: y - 7 }, thickness: 1.2, color: gold });

  // Datos del show.
  y -= 32;
  const fields: Array<[string, string, PDFFont]> = [
    ['Evento', upper(sheet.eventName), kit.regular],
    ['Boletera', upper(sheet.boletera), kit.bold],
    ['Fecha', upper(sheet.dateLabel), kit.regular],
    ['Horario', sheet.schedule, kit.regular],
  ];
  if (sheet.functions) fields.push(['Funciones', String(sheet.functions), kit.regular]);
  fields.push(['Venue', upper(sheet.venue), kit.regular]);
  fields.forEach(([label, value, font], i) => {
    if (i) y -= 20;
    drawField(kit, page, label, value, y, font);
  });

  // Zonas: AFORO al centro, PRECIO a la derecha. Más zonas, renglones más apretados.
  const shown = sheet.zones.slice(0, MAX_ZONES);
  const hidden = sheet.zones.length - shown.length;
  const dense = shown.length > 12 ? 3 : shown.length > 8 ? 2 : shown.length > 5 ? 1 : 0;
  const rowH = [24, 20, 17, 15][dense];
  const nameSize = [13, 12, 11, 10][dense];
  const numSize = dense >= 2 ? 10 : 11;
  const aforoCol: [number, number] = [AFORO_X - 55, AFORO_X + 55];
  const precioCol: [number, number] = [PRECIO_X - 60, PRECIO_X + 60];
  const nameMax = aforoCol[0] - LEFT - 6;

  y -= 40;
  drawCentered(page, 'AFORO', aforoCol[0], aforoCol[1], y, 10, kit.bold, ink);
  drawCentered(page, 'PRECIO', precioCol[0], precioCol[1], y, 10, kit.bold, ink);
  y -= 4;
  for (const zone of shown) {
    y -= rowH;
    page.drawText(fit(upper(zone.zona), kit.bold, nameSize, nameMax), {
      x: LEFT,
      y,
      size: nameSize,
      font: kit.bold,
      color: ink,
    });
    drawCentered(page, zone.aforo.toLocaleString('es-MX'), aforoCol[0], aforoCol[1], y, numSize, kit.regular, ink);
    drawCentered(page, priceLabel(zone.precio), precioCol[0], precioCol[1], y, numSize, kit.regular, ink);
  }
  if (hidden > 0) {
    y -= 14;
    page.drawText(pdfSafe(`+ ${hidden} zonas más`), { x: LEFT, y, size: 8.5, font: kit.italic, color: muted });
  }

  y -= rowH + 6;
  const ruleY = y + Math.round(rowH * 0.62) + 2;
  page.drawLine({ start: { x: LEFT, y: ruleY }, end: { x: precioCol[1], y: ruleY }, thickness: 0.6, color: line });
  page.drawText('CAPACIDAD', { x: LEFT, y, size: nameSize, font: kit.bold, color: ink });
  drawCentered(page, sheet.capacity.toLocaleString('es-MX'), aforoCol[0], aforoCol[1], y, numSize, kit.bold, ink);

  // Nota de cargos.
  y -= 26;
  const note = 'PRECIOS CON CXS YA INCLUIDOS';
  page.drawText(note, { x: LEFT, y, size: 8.5, font: kit.regular, color: ink });
  underline(page, LEFT, y, kit.regular.widthOfTextAtSize(note, 8.5), ink, 0.6);

  // Hold.
  y -= 32;
  page.drawText('HOLD', { x: LEFT, y, size: 10.5, font: kit.bold, color: ink });
  const holds: Array<[string, number | null]> = [
    ['Artista', sheet.hold.artist],
    ['Promotor', sheet.hold.promoter],
    ['Venue', sheet.hold.venue],
  ];
  for (const [label, value] of holds) {
    y -= 16;
    const head = `${label}: `;
    page.drawText(head, { x: LEFT, y, size: 10, font: boldItalic, color: ink });
    if (value !== null) {
      page.drawText(value.toLocaleString('es-MX'), {
        x: LEFT + boldItalic.widthOfTextAtSize(head, 10),
        y,
        size: 10,
        font: kit.regular,
        color: ink,
      });
    }
  }

  // Carpeta editable.
  if (sheet.artsUrl) {
    y -= 30;
    page.drawText('CARPETA EDITABLE:', { x: LEFT, y, size: 10, font: kit.bold, color: ink });
    y -= 15;
    const size = 9;
    const text = fit(sheet.artsUrl, kit.regular, size, RIGHT - LEFT);
    const width = kit.regular.widthOfTextAtSize(text, size);
    page.drawText(text, { x: LEFT, y, size, font: kit.regular, color: link });
    underline(page, LEFT, y, width, link, 0.5);
    if (sheet.artsHref) addLinkAnnotation(kit, lib, page, sheet.artsHref, [LEFT, y - 3, LEFT + width, y + size]);
  }

  // Descripción: entre comillas, recortada con gracia si no cabe.
  if (sheet.description) {
    const size = 9.5;
    const lh = 13.5;
    const minY = FOOTER_Y + 34;
    if (y - 46 >= minY) {
      y -= 30;
      page.drawText(pdfSafe('DESCRIPCIÓN DEL EVENTO:'), { x: LEFT, y, size: 10, font: kit.bold, color: ink });
      y -= 16;
      const width = Math.min(470, RIGHT - LEFT);
      let lines = wrapText(`"${sheet.description}"`, kit.regular, size, width).filter(
        (l, i, all) => l || (i > 0 && all[i - 1]),
      );
      const maxLines = Math.max(1, Math.floor((y - minY) / lh) + 1);
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        let last = lines[maxLines - 1].replace(/"$/, '');
        while (last && kit.regular.widthOfTextAtSize(`${last}..."`, size) > width) {
          last = last.replace(/\s*\S+$/, '');
        }
        lines[maxLines - 1] = `${last.trimEnd()}..."`;
      }
      for (const l of lines) {
        page.drawText(l, { x: LEFT, y, size, font: kit.regular, color: ink });
        y -= lh;
      }
    }
  }

  // Pie: firma de la casa a la derecha, filete con tramo dorado a la izquierda.
  const footerSize = 7.5;
  const footerW = kit.regular.widthOfTextAtSize(FOOTER, footerSize);
  page.drawText(FOOTER, { x: RIGHT - footerW, y: FOOTER_Y, size: footerSize, font: kit.regular, color: muted });
  const footRule = FOOTER_Y + 2.5;
  page.drawLine({ start: { x: LEFT, y: footRule }, end: { x: RIGHT - footerW - 14, y: footRule }, thickness: 0.5, color: line });
  page.drawLine({ start: { x: LEFT, y: footRule }, end: { x: LEFT + 36, y: footRule }, thickness: 1.4, color: gold });

  return savePdf(kit);
}

/** Genera y descarga `BOLETERA-<evento>.pdf`. */
export async function downloadBoleteraPdf(input: { setup: BoleteraPdfSetup; event: BoleteraPdfEvent }) {
  const blob = await buildBoleteraPdf(input);
  downloadBlob(blob, boleteraPdfFileName(input.event.name));
}
