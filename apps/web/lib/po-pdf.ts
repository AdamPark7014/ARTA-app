/**
 * PDF de una orden de compra con el machote de Arta (revisión 11-09-2026).
 *
 * Carta vertical, dentro de un borde fino: título, logo, datos de la
 * solicitud, PROVEEDOR / OTRO, tabla de partidas, forma de pago, totales,
 * firmas y observaciones con la nota de los días de cobro. Todo el texto del
 * usuario pasa por `pdfSafe`/`wrapText`: Helvetica solo sabe WinAnsi.
 */
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import type { Po } from '@/components/events/event-detail.types';
import {
  createPdfKit,
  downloadBlob,
  drawCentered,
  drawLogo,
  drawRight,
  fileSlug,
  LETTER,
  pdfDate,
  pdfMoney,
  pdfSafe,
  savePdf,
  wrapText,
} from '@/lib/pdf-kit';
import {
  PO_PAYMENT_CHOICES,
  poLineTotal,
  poPaymentLabel,
  poQtyLabel,
  poSavedTotals,
  splitPoDescription,
} from '@/lib/po-payment';

export type PoPdfInput = {
  po: Po;
  event: { name: string };
  /** "lunes, miércoles y viernes" — de la configuración de días de cobro. */
  payDaysLabel?: string;
};

const DEFAULT_PAY_DAYS = 'lunes, miércoles y viernes';

const [W, H] = LETTER;
/** Borde exterior y márgenes de contenido. */
const M = 36;
const L = 54;
const R = W - 54;

/** De «distancia desde arriba» a la coordenada de pdf-lib (origen abajo). */
const Y = (top: number) => H - top;

/** Línea base para centrar texto de `size` en una celda de alto `h`. */
const mid = (top: number, h: number, size: number) => top + h / 2 + size * 0.35;

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const safe = pdfSafe(text).replace(/\s+/g, ' ').trim();
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let out = safe;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}...`;
}

/** Tamaño más grande (≤ max) con el que el texto cabe en `maxWidth`. */
function fitSize(text: string, font: PDFFont, max: number, maxWidth: number, min = 5): number {
  let size = max;
  const safe = pdfSafe(text);
  while (size > min && font.widthOfTextAtSize(safe, size) > maxWidth) size -= 0.25;
  return size;
}

function text(page: PDFPage, value: string, x: number, baseTop: number, size: number, font: PDFFont, color: RGB) {
  page.drawText(pdfSafe(value), { x, y: Y(baseTop), size, font, color });
}

function hline(page: PDFPage, x1: number, x2: number, top: number, color: RGB, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y: Y(top) }, end: { x: x2, y: Y(top) }, thickness, color });
}

function vline(page: PDFPage, x: number, top1: number, top2: number, color: RGB, thickness = 0.5) {
  page.drawLine({ start: { x, y: Y(top1) }, end: { x, y: Y(top2) }, thickness, color });
}

function fill(page: PDFPage, x: number, top: number, w: number, h: number, color: RGB) {
  page.drawRectangle({ x, y: Y(top + h), width: w, height: h, color });
}

/**
 * Rejilla: líneas en cada `x` y en cada `top`. El contorno va un poco más
 * grueso que el interior, como en un formato impreso.
 */
function grid(
  page: PDFPage,
  xs: number[],
  tops: number[],
  outer: RGB,
  inner: RGB,
  rowColor: RGB = inner,
) {
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const t0 = tops[0];
  const t1 = tops[tops.length - 1];
  tops.slice(1, -1).forEach((t) => hline(page, x0, x1, t, rowColor, 0.4));
  xs.slice(1, -1).forEach((x) => vline(page, x, t0, t1, inner, 0.5));
  page.drawRectangle({
    x: x0,
    y: Y(t1),
    width: x1 - x0,
    height: t1 - t0,
    borderColor: outer,
    borderWidth: 0.8,
  });
}

function checkbox(page: PDFPage, x: number, top: number, on: boolean, ink: RGB, bold: PDFFont) {
  const s = 10;
  page.drawRectangle({ x, y: Y(top + s), width: s, height: s, borderColor: ink, borderWidth: 0.7 });
  if (on) drawCentered(page, 'X', x, x + s, Y(top + s - 2.2), 8, bold, ink);
}

export async function buildPurchaseOrderPdf({ po, event, payDaysLabel }: PoPdfInput): Promise<Blob> {
  const kit = await createPdfKit();
  const { regular, bold, italic, colors } = kit;
  const ink = colors.ink;
  const gridInner = kit.rgb(0.32, 0.32, 0.35);
  const rowLine = kit.rgb(0.72, 0.72, 0.75);
  const page = kit.pdf.addPage(LETTER);
  kit.pdf.setTitle(`Orden de compra - ${pdfSafe(event.name)}`);
  kit.pdf.setCreator('Arta Producciones');

  const { description: notes } = splitPoDescription(po.description);
  const totals = poSavedTotals(po);
  const method = po.paymentMethod || 'TRANSFERENCIA';
  const payee = po.payeeType === 'OTRO' ? 'OTRO' : 'PROVEEDOR';

  // ── Marco ────────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: M,
    y: M,
    width: W - 2 * M,
    height: H - 2 * M,
    borderColor: ink,
    borderWidth: 1,
  });

  // ── Encabezado ───────────────────────────────────────────────────────────
  // `drawLogo` recibe el borde superior en coordenadas de pdf-lib.
  drawLogo(kit, page, L, Y(56), 26);
  drawCentered(page, 'ORDEN DE COMPRA', M, W - M, Y(80), 20, bold, ink);
  hline(page, L, R, 100, rowLine, 0.6);

  // ── Datos de la solicitud ───────────────────────────────────────────────
  const info: Array<[string, string]> = [
    ['FECHA DE SOLICITUD:', pdfDate(po.createdAt)],
    ['SOLICITANTE:', po.createdBy?.fullName || ''],
    ['EVENTO:', event.name],
    ['NOMBRE DE PROVEEDOR:', po.vendorName || ''],
  ];
  const labelSize = 8;
  const valueSize = 9.5;
  const labelW = Math.max(...info.map(([label]) => bold.widthOfTextAtSize(pdfSafe(label), labelSize)));
  const valueX = L + labelW + 8;
  const valueR = 414;
  info.forEach(([label, value], i) => {
    const base = 126 + i * 19;
    text(page, label, L, base, labelSize, bold, ink);
    if (value) text(page, fit(value, regular, valueSize, valueR - valueX - 2), valueX + 1, base, valueSize, regular, ink);
    hline(page, valueX, valueR, base + 3.5, rowLine, 0.5);
  });

  // PROVEEDOR | X  /  OTRO |
  const payeeW = 112;
  const payeeX = R - payeeW;
  const payeeMark = payeeX + 80;
  const payeeTop = 128;
  const payeeRow = 18;
  grid(page, [payeeX, payeeMark, R], [payeeTop, payeeTop + payeeRow, payeeTop + 2 * payeeRow], ink, gridInner, gridInner);
  (['PROVEEDOR', 'OTRO'] as const).forEach((label, i) => {
    const top = payeeTop + i * payeeRow;
    text(page, label, payeeX + 7, mid(top, payeeRow, 8), 8, bold, ink);
    if (payee === label) drawCentered(page, 'X', payeeMark, R, Y(mid(top, payeeRow, 10)), 10, bold, ink);
  });

  // ── Zona inferior, anclada al pie ───────────────────────────────────────
  const footerBase = H - M - 12;
  const signHeadH = 15;
  const signSpaceH = 52;
  const signBottom = footerBase - 16;
  const signTop = signBottom - 2 * (signHeadH + signSpaceH);
  const totRowH = 18;
  const totalsTop = signTop - 16 - 3 * totRowH;

  // ── Partidas ─────────────────────────────────────────────────────────────
  const tableTop = 204;
  const headH = 20;
  const tableBottomMax = totalsTop - 14;
  const bodyAvail = tableBottomMax - tableTop - headH;
  const lines = po.lines ?? [];
  let rowH = 20;
  const fillRows = Math.floor(bodyAvail / rowH);
  let rows = Math.max(9, fillRows, lines.length);
  let shown = lines;
  let overflow = 0;
  if (lines.length > fillRows) {
    rowH = Math.max(13, bodyAvail / lines.length);
    const maxRows = Math.floor(bodyAvail / rowH);
    if (lines.length > maxRows) {
      shown = lines.slice(0, maxRows - 1);
      overflow = lines.length - shown.length;
    }
    rows = maxRows;
  }
  const bodySize = rowH >= 18 ? 8.5 : 7.5;

  const tx = [L, L + 62, R - 176, R - 88, R];
  const tops = [tableTop, tableTop + headH];
  for (let i = 1; i <= rows; i += 1) tops.push(tableTop + headH + i * rowH);
  fill(page, L, tableTop, R - L, headH, colors.soft);
  grid(page, tx, tops, ink, gridInner, rowLine);
  hline(page, L, R, tableTop + headH, ink, 0.7);

  const heads = ['CANTIDAD', 'DESCRIPCIÓN DEL PRODUCTO', 'PRECIO', 'SUBTOTAL'];
  heads.forEach((h, i) => {
    drawCentered(page, h, tx[i], tx[i + 1], Y(mid(tableTop, headH, 7.5)), 7.5, bold, ink);
  });

  const pad = 6;
  shown.forEach((line, i) => {
    const top = tableTop + headH + i * rowH;
    const base = mid(top, rowH, bodySize);
    const qty = poQtyLabel(line.qty);
    if (qty) drawCentered(page, qty, tx[0], tx[1], Y(base), bodySize, regular, ink);
    text(page, fit(line.concept || '', regular, bodySize, tx[2] - tx[1] - pad * 2), tx[1] + pad, base, bodySize, regular, ink);
    const price = Number(line.unitPrice);
    if (Number.isFinite(price) && price > 0) {
      drawRight(page, pdfMoney(price), tx[3] - pad, Y(base), bodySize, regular, ink);
    }
    const total = poLineTotal(line);
    if (total !== null && total > 0) {
      drawRight(page, pdfMoney(total), tx[4] - pad, Y(base), bodySize, regular, ink);
    }
  });
  if (overflow > 0) {
    const top = tableTop + headH + shown.length * rowH;
    text(
      page,
      `... y ${overflow} partida${overflow === 1 ? '' : 's'} más`,
      tx[1] + pad,
      mid(top, rowH, bodySize),
      bodySize,
      italic,
      colors.muted,
    );
  }

  // ── Forma de pago (izquierda) y totales (derecha) ───────────────────────
  const payRows: Array<[string, string]> = [
    ['EFECTIVO', 'EFECTIVO'],
    ['TRANSFERENCIA', 'TRANSFERENCIA'],
    ['CHEQUE', 'CHEQUE'],
  ];
  payRows.forEach(([label, key], i) => {
    const top = totalsTop + i * totRowH;
    text(page, label, L, mid(top, totRowH, 8), 8, bold, ink);
    checkbox(page, L + 92, top + (totRowH - 10) / 2, method === key, ink, bold);
  });
  if (!(PO_PAYMENT_CHOICES as readonly string[]).includes(method)) {
    // Órdenes viejas en tarjeta u «otro»: se dice cuál, sin inventar casilla.
    const label = poPaymentLabel(method, splitPoDescription(po.description).paymentOther);
    text(
      page,
      fit(`FORMA REGISTRADA: ${label.toLocaleUpperCase('es-MX')}`, regular, 7.5, tx[2] - (L + 116) - 8),
      L + 116,
      mid(totalsTop, totRowH, 7.5),
      7.5,
      regular,
      colors.muted,
    );
  }

  const totX = [R - 176, R - 88, R];
  const totTops = [0, 1, 2, 3].map((i) => totalsTop + i * totRowH);
  fill(page, totX[0], totTops[2], R - totX[0], totRowH, colors.soft);
  grid(page, totX, totTops, ink, gridInner, gridInner);
  const totRows: Array<[string, number | null, boolean]> = [
    ['SUBTOTAL', totals.subtotal, false],
    ['IVA', po.withIva ? totals.iva : null, false],
    ['TOTAL', totals.total, true],
  ];
  totRows.forEach(([label, value, strong], i) => {
    const top = totTops[i];
    const font = strong ? bold : regular;
    text(page, label, totX[0] + pad, mid(top, totRowH, 8), 8, bold, ink);
    text(page, '$', totX[1] + pad, mid(top, totRowH, 8.5), 8.5, font, ink);
    if (value !== null) {
      const amount = pdfMoney(value).replace(/^\$\s?/, '');
      drawRight(page, amount, totX[2] - pad, Y(mid(top, totRowH, 8.5)), 8.5, font, ink);
    }
  });

  // ── Firmas (derecha) ────────────────────────────────────────────────────
  const sx = [R - 252, R - 126, R];
  const sTops = [
    signTop,
    signTop + signHeadH,
    signTop + signHeadH + signSpaceH,
    signTop + 2 * signHeadH + signSpaceH,
    signBottom,
  ];
  fill(page, sx[0], sTops[0], R - sx[0], signHeadH, colors.soft);
  fill(page, sx[0], sTops[2], R - sx[0], signHeadH, colors.soft);
  grid(page, sx, sTops, ink, gridInner, gridInner);
  const signCells: Array<[string, string, number, number]> = [
    ['FECHA DE PAGO', 'date', 0, 0],
    ['NOMBRE Y FIRMA DE AUTORIZADO', 'auth', 1, 0],
    ['NOMBRE Y FIRMA DE QUIEN ENTREGA', 'sign', 0, 2],
    ['NOMBRE Y FIRMA DE QUIEN RECIBE', 'sign', 1, 2],
  ];
  signCells.forEach(([label, kind, col, row]) => {
    const x0 = sx[col];
    const x1 = sx[col + 1];
    const headTop = sTops[row];
    const size = fitSize(label, bold, 7, x1 - x0 - 8);
    drawCentered(page, label, x0, x1, Y(mid(headTop, signHeadH, size)), size, bold, ink);
    const spaceTop = headTop + signHeadH;
    if (kind === 'date') {
      if (po.paidAt) {
        drawCentered(page, pdfDate(po.paidAt), x0, x1, Y(mid(spaceTop, signSpaceH, 8.5)), 8.5, regular, ink);
      }
      return;
    }
    hline(page, x0 + 14, x1 - 14, spaceTop + 31, rowLine, 0.5);
    if (kind === 'auth' && po.authorizedBy?.fullName) {
      const nameSize = 8;
      drawCentered(page, fit(po.authorizedBy.fullName, regular, nameSize, x1 - x0 - 10), x0, x1, Y(spaceTop + 41), nameSize, regular, ink);
      if (po.authorizedAt) {
        drawCentered(page, pdfDate(po.authorizedAt), x0, x1, Y(spaceTop + 49), 6.5, regular, colors.muted);
      }
    }
  });

  // ── Observaciones (izquierda) ───────────────────────────────────────────
  const oX0 = L;
  const oX1 = sx[0] - 12;
  const oW = oX1 - oX0;
  fill(page, oX0, signTop, oW, signHeadH, colors.soft);
  grid(page, [oX0, oX1], [signTop, signTop + signHeadH, signBottom], ink, gridInner, gridInner);
  text(page, 'OBSERVACIONES', oX0 + pad, mid(signTop, signHeadH, 7), 7, bold, ink);

  const inner = oW - pad * 2;
  const days = (payDaysLabel?.trim() || DEFAULT_PAY_DAYS).toLocaleUpperCase('es-MX');
  const noteSize = 7.5;
  const noteLead = 9.5;
  let base = signTop + signHeadH + 11;
  for (const l of wrapText(`LOS PAGOS DE CAMPAÑAS ÚNICAMENTE SE REALIZARÁN ${days}`, bold, noteSize, inner)) {
    text(page, l, oX0 + pad, base, noteSize, bold, colors.red);
    base += noteLead;
  }

  const obsSize = 8.5;
  const obsLead = 11;
  base += 4;
  const maxLines = Math.max(0, Math.floor((signBottom - 4 - base) / obsLead) + 1);
  const obs = notes.trim() ? wrapText(notes, regular, obsSize, inner) : [];
  const visible = obs.slice(0, maxLines);
  if (obs.length > maxLines && visible.length) {
    visible[visible.length - 1] = fit(`${visible[visible.length - 1]} ...`, regular, obsSize, inner);
  }
  visible.forEach((l) => {
    text(page, l, oX0 + pad, base, obsSize, regular, ink);
    base += obsLead;
  });

  // ── Pie ──────────────────────────────────────────────────────────────────
  text(page, '* ANEXAR COMPROBANTE DE PAGO', L, footerBase, 7.5, bold, colors.red);
  drawRight(page, `OC ${po.id.slice(-6).toUpperCase()}`, R, Y(footerBase), 6.5, regular, colors.muted);

  return savePdf(kit);
}

/** `OC-<evento>-<proveedor>.pdf` */
export function poPdfFileName(po: Pick<Po, 'vendorName'>, event: { name: string }): string {
  return `OC-${fileSlug(event.name || '', 'evento')}-${fileSlug(po.vendorName || '', 'proveedor')}.pdf`;
}

/** Genera y descarga. */
export async function downloadPurchaseOrderPdf(input: PoPdfInput): Promise<void> {
  const blob = await buildPurchaseOrderPdf(input);
  downloadBlob(blob, poPdfFileName(input.po, input.event));
}
