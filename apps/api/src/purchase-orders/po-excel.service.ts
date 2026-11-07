import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { createHash, randomBytes } from 'crypto';
import { existsSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { uploadRoot } from '../uploads/upload-storage';
import type { Prisma } from '@prisma/client';

type Num = Prisma.Decimal | number | string | null | undefined;

export type SimpleOrder = {
  id: string;
  eventId: string;
  rubro?: string | null;
  vendorName: string | null;
  description: string | null;
  paymentMethod: string | null;
  payeeType: string | null;
  withIva: boolean | null;
  amount: Num;
  adendumPerson?: string | null;
  adendumAccount?: string | null;
  createdAt: Date | null;
  createdBy?: { fullName?: string | null } | null;
  authorizedBy?: { fullName?: string | null } | null;
  authorizedAt?: Date | null;
  paidAt?: Date | null;
  lines?: Array<{ concept: string; qty: Num; unitPrice: Num; total?: Num }>;
};

type SimpleEvent = { name: string; entity: string };

const MONTHS = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];
const PUEBLA_OFFSET_MS = 6 * 3600 * 1000;
/** Siempre con centavos: el machote trae `"$"#,##0` en el TOTAL y $4,000.50 saldría como $4,001. */
const MONEY_FMT = '"$"#,##0.00';

const PAYMENT_LABEL: Record<string, string> = {
  EFECTIVO: 'EFECTIVO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CHEQUE: 'CHEQUE',
  TARJETA: 'TARJETA',
  OTRO: 'OTRO',
  ADENDUM: 'ADENDUM',
};

function num(n: Num): number | null {
  if (n == null || n === '') return null;
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** «22 DE SEPTIEMBRE DEL 2026», en hora de Puebla, como lo escribe el machote a mano. */
export function longDateEs(d: Date | string | null | undefined): string {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return '';
  const p = new Date(t - PUEBLA_OFFSET_MS);
  return `${p.getUTCDate()} DE ${MONTHS[p.getUTCMonth()]} DEL ${p.getUTCFullYear()}`;
}

function shortDateEs(d: Date | string | null | undefined): string {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return '';
  const p = new Date(t - PUEBLA_OFFSET_MS);
  const dd = String(p.getUTCDate()).padStart(2, '0');
  const mm = String(p.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${p.getUTCFullYear()}`;
}

/**
 * Texto de una celda sin tumbar el proceso. `cell.text` de exceljs revienta en
 * una celda combinada cuya celda maestra está vacía (MergeValue.toString sobre
 * null): así fallaba el botón «PDF» de cada OC con el machote real (07-11).
 */
export function cellText(cell: ExcelJS.Cell): string {
  const source = cell.isMerged ? cell.master : cell;
  const v = source.value as unknown;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text: string }>; result?: unknown; text?: unknown; formula?: unknown; sharedFormula?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('').trim();
    if ('formula' in o || 'sharedFormula' in o) return o.result == null ? '' : String(o.result).trim();
    if (typeof o.text === 'string') return o.text.trim();
    return '';
  }
  return String(v).trim();
}

function isMaster(cell: ExcelJS.Cell): boolean {
  return !cell.isMerged || cell.master.address === cell.address;
}

type Label = { row: number; col: number; text: string; right: number; bottom: number };

/** Etiquetas del machote (celdas maestras con texto), con hasta dónde llega su combinación. */
function scanLabels(ws: ExcelJS.Worksheet, maxRow = 80, maxCol = 20): Label[] {
  const out: Label[] = [];
  const rows = Math.min(maxRow, ws.rowCount);
  const cols = Math.min(maxCol, Math.max(ws.columnCount, 1));
  for (let r = 1; r <= rows; r += 1) {
    for (let c = 1; c <= cols; c += 1) {
      const cell = ws.getCell(r, c);
      if (!isMaster(cell)) continue;
      const text = cellText(cell);
      if (!text) continue;
      let right = c;
      let bottom = r;
      if (cell.isMerged) {
        while (right < cols + 10 && ws.getCell(r, right + 1).isMerged && ws.getCell(r, right + 1).master.address === cell.address) right += 1;
        while (bottom < rows + 10 && ws.getCell(bottom + 1, c).isMerged && ws.getCell(bottom + 1, c).master.address === cell.address) bottom += 1;
      }
      out.push({ row: r, col: c, text, right, bottom });
    }
  }
  return out;
}

function clear(cell: ExcelJS.Cell) {
  if (isMaster(cell)) cell.value = null;
}

/** Combina un rango solo si ninguna de sus celdas ya está combinada; si no, deja el machote como está. */
function safeMerge(ws: ExcelJS.Worksheet, top: number, left: number, bottom: number, right: number) {
  for (let r = top; r <= bottom; r += 1) {
    for (let c = left; c <= right; c += 1) {
      if (ws.getCell(r, c).isMerged) return;
    }
  }
  try {
    ws.mergeCells(top, left, bottom, right);
  } catch {
    /* rango raro en el machote: se deja sin combinar */
  }
}

/** Letra de una celda del machote, con tamaño mínimo; sirve de referencia para lo que se escribe. */
function fontOf(cell: ExcelJS.Cell, minSize: number): Partial<ExcelJS.Font> & { size: number } {
  const f = (cell.font || {}) as Partial<ExcelJS.Font>;
  const size = typeof f.size === 'number' && f.size >= minSize ? f.size : minSize;
  return { name: f.name || 'Calibri', ...f, size };
}

function colLetter(col: number): string {
  let s = '';
  let n = col;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export type OrderRows = {
  rows: Array<{ qty: number | null; concept: string; unitPrice: number | null; total: number }>;
  subtotal: number;
  iva: number;
  total: number;
};

/**
 * Partidas listas para escribir, cuadradas con el monto autorizado: con IVA, el IVA es la
 * diferencia exacta; sin IVA, un centavo de redondeo entre las partidas y el total se
 * absorbe en la última partida. La hoja siempre suma lo que se autorizó.
 */
export function orderRows(order: SimpleOrder): OrderRows {
  const total = round2(num(order.amount) ?? 0);
  const lines = (order.lines || []).filter((l) => (l.concept || '').trim() || num(l.total) || num(l.unitPrice));
  if (!lines.length) {
    const subtotal = order.withIva ? round2(total / 1.16) : total;
    const concept = (order.description || '').trim() || (order.rubro ? String(order.rubro).toUpperCase() : 'ORDEN DE COMPRA');
    return { rows: [{ qty: 1, concept, unitPrice: subtotal, total: subtotal }], subtotal, iva: round2(total - subtotal), total };
  }
  const rows = lines.map((l) => {
    const qty = num(l.qty) ?? 1;
    const unitPrice = num(l.unitPrice);
    const lineTotal = num(l.total) ?? round2(qty * (unitPrice ?? 0));
    return { qty, concept: (l.concept || '').trim(), unitPrice, total: round2(lineTotal) };
  });
  let subtotal = round2(rows.reduce((s, r) => s + r.total, 0));
  if (order.withIva) {
    return { rows, subtotal, iva: round2(total - subtotal), total };
  }
  if (total > 0 && subtotal !== total) {
    const last = rows[rows.length - 1];
    last.total = round2(last.total + (total - subtotal));
    subtotal = total;
  }
  return { rows, subtotal, iva: 0, total: total > 0 ? total : subtotal };
}

/**
 * Huella de lo que entra a la hoja. El zip del xlsx cambia de bytes en cada escritura (lleva la
 * hora), así que una huella de bytes subía la versión en cada clic; con esta, exportar sin
 * cambios no crea una versión nueva.
 */
export function orderFingerprint(order: SimpleOrder, event: SimpleEvent): string {
  const { rows, subtotal, iva, total } = orderRows(order);
  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
  const data = {
    v: 2,
    event: event.name,
    vendor: order.vendorName ?? null,
    description: order.description ?? null,
    payment: order.paymentMethod ?? null,
    payee: order.payeeType ?? null,
    withIva: !!order.withIva,
    adendum: [order.adendumPerson ?? null, order.adendumAccount ?? null],
    createdAt: iso(order.createdAt),
    createdBy: order.createdBy?.fullName ?? null,
    authorizedBy: order.authorizedBy?.fullName ?? null,
    authorizedAt: iso(order.authorizedAt),
    paidAt: iso(order.paidAt),
    rows,
    subtotal,
    iva,
    total,
  };
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

@Injectable()
export class PurchaseOrderExcelService {
  /**
   * Arma el Excel de la OC. Con el machote de Arta en disco lo llena; si el machote no está o le
   * faltan las etiquetas que lo anclan, arma una OC limpia (nunca una hoja a medias). Escribe en un
   * archivo temporal y lo renombra: dos exportaciones a la vez no se leen a medio escribir.
   */
  async buildFromTemplate(templatePath: string, order: SimpleOrder, event: SimpleEvent, outPath?: string): Promise<{ excelPath: string }> {
    const wb = new ExcelJS.Workbook();
    let filled = false;
    if (existsSync(templatePath)) {
      await wb.xlsx.readFile(templatePath);
      // El machote trae una segunda hoja con una OC vieja de ejemplo: fuera.
      for (const extra of wb.worksheets.slice(1)) wb.removeWorksheet(extra.id);
      const ws = wb.worksheets[0];
      filled = !!ws && this.fillTemplate(ws, order, event);
      if (!filled) for (const sheet of [...wb.worksheets]) wb.removeWorksheet(sheet.id);
    }
    if (!filled) this.buildPlain(wb, order, event);
    const stamp = order.createdAt ? new Date(order.createdAt) : new Date(0);
    wb.created = stamp;
    wb.modified = stamp;

    const excelPath = outPath || join(uploadRoot, `oc-${order.id}-v1.xlsx`);
    const tmp = `${excelPath}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    writeFileSync(tmp, buffer);
    try {
      renameSync(tmp, excelPath);
    } catch (e) {
      try {
        unlinkSync(tmp);
      } catch {
        /* nada que limpiar */
      }
      throw e;
    }
    return { excelPath };
  }

  /** Datos de la cabecera tal como el equipo los escribía en el cuadro de texto del machote. */
  headerLines(order: SimpleOrder, event: SimpleEvent): string[] {
    const lines = [
      `FECHA DE SOLICITUD: ${longDateEs(order.createdAt)}`,
      `SOLICITANTE: ${(order.createdBy?.fullName || '').toUpperCase()}`,
      `EVENTO: ${(event.name || '').toUpperCase()}`,
      `NOMBRE DE PROVEEDOR: ${(order.vendorName || '').toUpperCase()}`,
    ];
    const method = (order.paymentMethod || '').toUpperCase();
    if (method === 'ADENDUM') {
      const who = (order.adendumPerson || '').trim();
      const account = (order.adendumAccount || '').trim();
      lines.push(`FORMA DE PAGO: ADENDUM${who ? ` · A NOMBRE DE ${who.toUpperCase()}` : ''}${account ? ` · CUENTA ${account}` : ''}`);
    } else if (method === 'TARJETA' || method === 'OTRO') {
      lines.push(`FORMA DE PAGO: ${PAYMENT_LABEL[method]}`);
    }
    return lines;
  }

  /** Devuelve `false` si el machote no trae las etiquetas que anclan la OC; entonces se arma una limpia. */
  private fillTemplate(ws: ExcelJS.Worksheet, order: SimpleOrder, event: SimpleEvent): boolean {
    const labels = scanLabels(ws);
    const find = (re: RegExp, after = 0) => labels.find((l) => l.row > after && re.test(l.text));

    const payee = find(/^proveedor$/i);
    const otro = find(/^otro$/i);
    const head = labels.find((l) => /^cant/i.test(l.text));
    const descr = head ? labels.find((l) => l.row === head.row && /^descr|^concepto/i.test(l.text)) : undefined;
    const totalCol = head ? labels.find((l) => l.row === head.row && /sub ?total|importe|^total/i.test(l.text)) : undefined;
    const priceCol = head ? labels.find((l) => l.row === head.row && /^precio|^p\.? ?unit|unitario/i.test(l.text)) : undefined;
    const sumLabel = head ? find(/^sub ?total$/i, head.row) : undefined;
    const ivaLabel = head ? find(/^iva/i, head.row) : undefined;
    const totLabel = head ? find(/^total$/i, head.row) : undefined;
    if (!payee || !head || !descr || !totalCol || !totLabel) return false;

    // Letra del propio machote: las etiquetas van a 30–36 pt porque la hoja se imprime
    // encogida; con 11 pt el texto saldría ilegible en el PDF.
    const labelFont = fontOf(ws.getCell(payee.row, payee.col), 18);
    const markFont = fontOf(ws.getCell(payee.row, payee.right + 1), labelFont.size);
    const lineFont = fontOf(ws.getCell(head.bottom + 1, descr.col), Math.round(labelFont.size * 0.8));
    const totalRefCell = ws.getCell(totLabel.row, totLabel.right + 1);
    const moneyFont = fontOf(totalRefCell, labelFont.size);

    // 1) Cabecera. El machote la trae en un cuadro de texto que exceljs no
    //    conserva; se escribe en celdas, combinadas de B a H, en el mismo lugar.
    const headTop = payee.row;
    const headLines = this.headerLines(order, event);
    const lastHeadCol = Math.max(2, payee.col - 2);
    headLines.forEach((text, i) => {
      const r = headTop + i;
      // La fila 13 trae un bloque D:H combinado y vacío; se suelta para la quinta línea.
      for (let c = 2; c <= lastHeadCol; c += 1) {
        const cell = ws.getCell(r, c);
        if (cell.isMerged && !cellText(cell)) {
          try {
            ws.unMergeCells(cell.master.address);
          } catch {
            /* sin combinar */
          }
        }
      }
      safeMerge(ws, r, 2, r, lastHeadCol);
      const cell = ws.getCell(r, 2);
      cell.value = text;
      cell.font = { ...labelFont, size: Math.max(9, Math.round(labelFont.size * 0.85)), bold: true };
      // Con ajuste: un proveedor largo baja de línea en vez de cortarse con «…» en el PDF.
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });

    // 2) A quién se paga: una sola X.
    const payeeType = (order.payeeType || 'PROVEEDOR').toUpperCase();
    for (const l of [payee, otro]) if (l) clear(ws.getCell(l.row, l.right + 1));
    const payeeHit = payeeType === 'OTRO' && otro ? otro : payee;
    const x = ws.getCell(payeeHit.row, payeeHit.right + 1);
    x.value = 'X';
    x.font = markFont;
    x.alignment = { horizontal: 'center', vertical: 'middle' };

    // 3) Partidas.
    const { rows, subtotal, iva, total } = orderRows(order);
    const first = head.bottom + 1;
    let last = sumLabel ? sumLabel.row - 2 : first + 8;
    // Si el TOTAL trae SUM(K20:K28), ese rango manda.
    const f = totalRefCell.value as { formula?: string } | null;
    const m = f && typeof f === 'object' && typeof f.formula === 'string' ? /SUM\(\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)\)/i.exec(f.formula) : null;
    if (m) last = Number(m[2]);
    if (last < first) last = first;
    const capacity = last - first + 1;

    // Fuera los datos de ejemplo del machote (también la columna A).
    for (let r = first; r <= last; r += 1) {
      for (let c = 1; c <= totalCol.right; c += 1) clear(ws.getCell(r, c));
    }

    let toWrite = rows;
    if (rows.length > capacity) {
      const kept = rows.slice(0, capacity - 1);
      const rest = rows.slice(capacity - 1);
      toWrite = [
        ...kept,
        {
          qty: null,
          concept: `… Y ${rest.length} PARTIDAS MÁS (DETALLE EN ARTA)`,
          unitPrice: null,
          total: round2(rest.reduce((s, r) => s + r.total, 0)),
        },
      ];
    }

    toWrite.forEach((ln, i) => {
      const r = first + i;
      safeMerge(ws, r, descr.col, r, priceCol ? priceCol.col - 1 : totalCol.col - 1);
      const q = ws.getCell(r, head.col);
      q.value = ln.qty;
      q.font = lineFont;
      q.alignment = { horizontal: 'center', vertical: 'middle' };
      const d = ws.getCell(r, descr.col);
      d.value = priceCol || ln.qty == null || ln.qty === 1 || ln.unitPrice == null
        ? ln.concept
        : `${ln.concept}  (${ln.qty} × $${ln.unitPrice.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
      d.font = lineFont;
      d.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      if (priceCol) {
        const pc = ws.getCell(r, priceCol.col);
        pc.value = ln.unitPrice;
        pc.font = lineFont;
        pc.numFmt = MONEY_FMT;
      }
      const t = ws.getCell(r, totalCol.col);
      t.value = ln.total;
      t.font = lineFont;
      t.numFmt = MONEY_FMT;
    });

    // 4) Totales con fórmula (la copia de Excel se puede editar) y su resultado.
    const col = colLetter(totalCol.col);
    const sumCell = sumLabel ? ws.getCell(sumLabel.row, sumLabel.right + 1) : null;
    const ivaCell = ivaLabel ? ws.getCell(ivaLabel.row, ivaLabel.right + 1) : null;
    const totCell = totalRefCell;
    if (sumCell) {
      sumCell.value = { formula: `SUM(${col}${first}:${col}${last})`, result: subtotal } as ExcelJS.CellFormulaValue;
      sumCell.numFmt = MONEY_FMT;
      sumCell.font = { ...moneyFont, size: Math.round(moneyFont.size * 0.75) };
    }
    if (ivaCell) {
      ivaCell.value = iva;
      ivaCell.numFmt = MONEY_FMT;
      ivaCell.font = { ...moneyFont, size: Math.round(moneyFont.size * 0.75) };
    }
    totCell.value = sumCell && ivaCell
      ? ({ formula: `${sumCell.address}+${ivaCell.address}`, result: total } as ExcelJS.CellFormulaValue)
      : total;
    totCell.numFmt = MONEY_FMT;
    totCell.font = { ...moneyFont, bold: true };

    // 5) Forma de pago: una X en su casilla.
    const method = (order.paymentMethod || '').toUpperCase();
    for (const key of ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE']) {
      const l = find(new RegExp(`^${key}$`, 'i'));
      if (!l) continue;
      const box = ws.getCell(l.row, l.right + 1);
      clear(box);
      if (method === key) {
        box.value = 'X';
        box.font = markFont;
        box.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }

    // 6) Fecha de pago y quién autorizó, debajo de su etiqueta (el espacio de firma queda libre).
    const paidLabel = find(/fecha de pago/i);
    if (paidLabel) {
      const c = ws.getCell(paidLabel.bottom + 1, paidLabel.col);
      clear(c);
      if (order.paidAt) {
        c.value = longDateEs(order.paidAt);
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.font = { ...fontOf(ws.getCell(paidLabel.row, paidLabel.col), 14), bold: true };
      }
    }
    const authLabel = find(/firma de autorizado/i);
    if (authLabel) {
      const c = ws.getCell(authLabel.bottom + 1, authLabel.col);
      clear(c);
      const who = (order.authorizedBy?.fullName || '').trim();
      if (who) {
        c.value = `${who.toUpperCase()}${order.authorizedAt ? `\nAUTORIZÓ EL ${shortDateEs(order.authorizedAt)}` : ''}`;
        c.alignment = { horizontal: 'center', vertical: 'bottom', wrapText: true };
        c.font = { ...fontOf(ws.getCell(authLabel.row, authLabel.col), 14), bold: true };
      }
    }
    return true;
  }

  /** Sin machote en disco (instalación nueva) o con uno que no se reconoce: una OC limpia y legible, no un error. */
  private buildPlain(wb: ExcelJS.Workbook, order: SimpleOrder, event: SimpleEvent) {
    const ws = wb.addWorksheet('ORDEN DE COMPRA');
    ws.columns = [{ width: 12 }, { width: 58 }, { width: 16 }, { width: 18 }];
    ws.mergeCells('A1:D1');
    const title = ws.getCell('A1');
    title.value = 'ORDEN DE COMPRA';
    title.font = { size: 16, bold: true };
    title.alignment = { horizontal: 'center' };
    let r = 3;
    for (const line of this.headerLines(order, event)) {
      ws.mergeCells(r, 1, r, 4);
      const c = ws.getCell(r, 1);
      c.value = line;
      c.font = { size: 9, bold: true };
      r += 1;
    }
    r += 1;
    const head = ws.getRow(r);
    head.values = ['CANTIDAD', 'DESCRIPCIÓN', 'PRECIO', 'SUBTOTAL'];
    head.font = { bold: true };
    const { rows, subtotal, iva, total } = orderRows(order);
    for (const ln of rows) {
      r += 1;
      ws.getRow(r).values = [ln.qty ?? '', ln.concept, ln.unitPrice ?? '', ln.total];
      ws.getCell(r, 3).numFmt = MONEY_FMT;
      ws.getCell(r, 4).numFmt = MONEY_FMT;
    }
    r += 2;
    for (const [label, value] of [['SUBTOTAL', subtotal], ['IVA', iva], ['TOTAL', total]] as const) {
      ws.getCell(r, 3).value = label;
      ws.getCell(r, 3).font = { bold: true };
      ws.getCell(r, 4).value = value;
      ws.getCell(r, 4).numFmt = MONEY_FMT;
      r += 1;
    }
    const method = (order.paymentMethod || '').toUpperCase();
    r += 1;
    ws.getCell(r, 1).value = `FORMA DE PAGO: ${PAYMENT_LABEL[method] || method || '—'}`;
    if (order.authorizedBy?.fullName) ws.getCell(r + 1, 1).value = `AUTORIZÓ: ${order.authorizedBy.fullName.toUpperCase()}`;
    if (order.paidAt) ws.getCell(r + 2, 1).value = `FECHA DE PAGO: ${longDateEs(order.paidAt)}`;
  }
}
