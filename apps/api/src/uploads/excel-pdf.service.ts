import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { uploadRoot } from './upload-storage';
import { cleanDisplayTitle, PdfBrandingService, type BrandingMeta, FOOTER_RESERVE } from './pdf-branding.service';
import { buildSheetModel, type CellBox, type SheetModel } from './sheet-layout';

type SheetPdfInput = {
  eventName: string;
  entity: string;
  fileName: string;
  exportedBy?: string | null;
};

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const ITALIC = 'Helvetica-Oblique';
const BOLD_ITALIC = 'Helvetica-BoldOblique';
const MARGIN = 36;
const CELL_PAD = 3;
/** Por debajo de esto la hoja ya no se lee en vertical: mejor apaisado que encoger más. */
const MIN_SCALE_PORTRAIT = 0.72;
/** Siempre cabe a lo ancho (como «ajustar a una página de ancho» en Excel). */
const MIN_SCALE = 0.3;
/** Un texto que no cabe se encoge hasta aquí antes de cortarse con «...». */
const SHRINK_TO = 0.7;
const MAX_PAGES = 40;

/**
 * Excel embebido → PDF de salida.
 *
 * La copia de trabajo sigue siendo el .xlsx dentro del sistema; lo que «sale»
 * (compartir, imprimir, entregar) es este PDF. Se imprime lo que Excel
 * imprimiría: celdas combinadas una sola vez, anchos y altos del libro,
 * negritas, rellenos, bordes, fórmulas ya calculadas e imágenes, con la marca
 * del cliente arriba y abajo. La hoja se encoge para caber a lo ancho y, si
 * aun así no cabe, pasa a apaisado.
 */
@Injectable()
export class ExcelPdfService {
  constructor(private branding: PdfBrandingService = new PdfBrandingService()) {}

  private dir() {
    const dir = join(uploadRoot, 'sheet-pdfs');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  async generate(
    sourceFileId: string,
    version: number,
    sourcePath: string,
    input: SheetPdfInput & { draftWatermark?: boolean; branding?: Partial<BrandingMeta> },
  ): Promise<{ url: string; filePath: string; fileName: string }> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(sourcePath);
    } catch {
      throw new BadRequestException('No se pudo leer el Excel para generar el PDF');
    }

    const dir = this.dir();
    // Nombre visible: <EVENTO>_<AAAAMMDD>_<FORMATO>_v<N>.pdf
    const safeName = (s: string) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 80);
    const dateLabel = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const baseTitle = cleanDisplayTitle(input.fileName.replace(/\.(xlsx?|csv)$/i, ''));
    const visibleBase = `${safeName(input.eventName)}_${dateLabel}_${safeName(baseTitle)}_v${version}`.toUpperCase();
    const storageName = `${sourceFileId}-v${version}.pdf`;
    const filePath = join(dir, storageName);

    const sheets = wb.worksheets.filter((ws) => (ws as { state?: string }).state !== 'hidden');
    const models = sheets.map((ws) => buildSheetModel(ws, wb)).filter((m) => m.cells.length || m.images.length);

    await this.render(filePath, models, {
      entity: input.entity,
      eventName: input.eventName,
      fileName: baseTitle,
      version,
      generatedBy: input.exportedBy || null,
      generatedAt: new Date(),
      ...(input.branding || {}),
    }, !!input.draftWatermark);

    return {
      url: `/uploads/sheet-pdfs/${storageName}`,
      filePath,
      fileName: `${visibleBase}.pdf`,
    };
  }

  /** Dibuja los modelos ya resueltos. Separado de `generate` para poder probarlo sin disco de subida. */
  async render(filePath: string, models: SheetModel[], meta: BrandingMeta, draftWatermark = false): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: MARGIN,
        autoFirstPage: false,
        bufferPages: true,
        info: { Title: `${meta.fileName || 'Hoja'} - ${meta.eventName}`, Author: 'Arta Producciones' },
      });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      doc.on('error', reject);

      if (!models.length) {
        doc.addPage({ size: 'LETTER', layout: 'portrait', margin: MARGIN });
        const top = this.branding.drawHeaderFooter(doc, meta);
        doc.font(ITALIC).fontSize(10).fillColor('#6b6b72').text('El libro no tiene hojas con contenido para exportar.', MARGIN, top + 10, { lineBreak: false });
      }

      let pages = 0;
      for (const model of models) {
        const many = models.length > 1;
        const sheetMeta: BrandingMeta = many ? { ...meta, fileName: `${meta.fileName} · ${model.name}` } : meta;
        pages = this.drawSheet(doc, model, sheetMeta, draftWatermark, pages);
        if (pages >= MAX_PAGES) break;
      }

      this.branding.stampPageNumbers(doc);
      doc.end();
    });
  }

  private drawSheet(doc: PDFKit.PDFDocument, model: SheetModel, meta: BrandingMeta, draftWatermark: boolean, pagesSoFar: number): number {
    // Orientación y escala: cabe a lo ancho en vertical; si haría falta encoger
    // demasiado (o el libro lo pide), apaisado.
    const portraitW = 612 - MARGIN * 2;
    const landscapeW = 792 - MARGIN * 2;
    const width = Math.max(model.totalWidth, 1);
    // El libro puede pedir apaisado; «vertical» solo se respeta si aún se lee.
    let layout: 'portrait' | 'landscape' = model.orientation === 'landscape' ? 'landscape' : 'portrait';
    if (layout === 'portrait' && width > portraitW && portraitW / width < MIN_SCALE_PORTRAIT) layout = 'landscape';
    const contentW = layout === 'landscape' ? landscapeW : portraitW;
    const scale = Math.max(MIN_SCALE, Math.min(1, contentW / width));

    const colW = model.colWidths.map((w) => w * scale);
    const rowH = model.rowHeights.map((h) => h * scale);
    const colX = prefix(colW);
    // La hoja entera cabe a lo ancho; centrada si sobra espacio.
    const originX = MARGIN + Math.max(0, (contentW - colX[colX.length - 1]) / 2);

    // Alturas reales: una celda con ajuste de texto puede necesitar más de lo que dice el libro.
    for (const cell of model.cells) {
      if (!cell.wrap || !cell.text) continue;
      const boxW = spanWidth(colW, cell.col - 1, cell.colSpan) - CELL_PAD * 2;
      const size = cell.fontSize * scale;
      doc.font(fontFor(cell)).fontSize(size);
      const lines = wrapLines(doc, cell.text, boxW);
      const needed = lines.length * size * 1.2 + CELL_PAD * 2;
      const have = spanHeight(rowH, cell.row - 1, cell.rowSpan);
      if (needed > have) rowH[cell.row + cell.rowSpan - 2] += needed - have;
    }
    const rowY = prefix(rowH);

    // Paginación por filas: una fila no se parte.
    let pages = pagesSoFar;
    let page = 0;
    const pageBottom = () => doc.page.height - FOOTER_RESERVE;
    const newPage = (first: boolean) => {
      doc.addPage({ size: 'LETTER', layout, margin: MARGIN });
      pages += 1;
      const top = this.branding.drawHeaderFooter(doc, meta, undefined, 100, { compact: !first });
      if (draftWatermark) this.branding.draftWatermark(doc);
      return top;
    };
    let originY = newPage(page === 0);
    page += 1;
    let firstRow = 0; // índice de la primera fila visible en la página actual
    let pageTop = originY;

    const rowsOnPage: Array<{ from: number; to: number; y: number }> = [];
    let r = 0;
    while (r < rowH.length) {
      const avail = pageBottom() - pageTop;
      let to = r;
      let used = 0;
      while (to < rowH.length && used + rowH[to] <= avail) {
        used += rowH[to];
        to += 1;
      }
      if (to === r) {
        // Una fila más alta que la página: se imprime recortada.
        to = r + 1;
      }
      rowsOnPage.push({ from: r, to, y: pageTop });
      this.drawRows(doc, model, r, to, originX, pageTop - rowY[r], colW, colX, rowH, rowY, scale);
      firstRow = to;
      r = to;
      if (r < rowH.length) {
        if (pages >= MAX_PAGES) break;
        originY = newPage(false);
        pageTop = originY;
      }
    }
    void firstRow;
    return pages;
  }

  /** Dibuja las filas [from, to) con el origen de la hoja desplazado a `offsetY`. */
  private drawRows(
    doc: PDFKit.PDFDocument,
    model: SheetModel,
    from: number,
    to: number,
    originX: number,
    offsetY: number,
    colW: number[],
    colX: number[],
    rowH: number[],
    rowY: number[],
    scale: number,
  ) {
    const inRange = (cell: CellBox) => {
      const r0 = cell.row - 1;
      return r0 < to && r0 + cell.rowSpan > from;
    };
    const yOf = (rowIndex0: number) => offsetY + rowY[rowIndex0];
    const clipTop = yOf(from);
    const clipBottom = yOf(to);

    // 1) Rellenos.
    for (const cell of model.cells) {
      if (!cell.fill || !inRange(cell)) continue;
      const x = originX + colX[cell.col - 1];
      const y = Math.max(clipTop, yOf(cell.row - 1));
      const w = spanWidth(colW, cell.col - 1, cell.colSpan);
      const h = Math.min(clipBottom, yOf(cell.row - 1) + spanHeight(rowH, cell.row - 1, cell.rowSpan)) - y;
      if (w > 0 && h > 0) doc.rect(x, y, w, h).fill(cell.fill);
    }

    // 2) Imágenes, ancladas a su celda (las filas pueden haber crecido por el ajuste de texto).
    for (const img of model.images) {
      const anchorRow = Math.min(img.row, rowY.length - 1);
      const anchorCol = Math.min(img.col, colX.length - 1);
      const y = offsetY + rowY[anchorRow] + img.dy * scale;
      const x = originX + colX[anchorCol] + img.dx * scale;
      const h = img.h * scale;
      if (y + h < clipTop || y > clipBottom) continue;
      try {
        doc.image(img.buffer, x, y, { width: img.w * scale, height: h });
      } catch {
        // formato de imagen no soportado por pdfkit: se omite
      }
    }

    // 3) Texto.
    for (const cell of model.cells) {
      if (!cell.text || !inRange(cell)) continue;
      const x = originX + colX[cell.col - 1];
      const y = yOf(cell.row - 1);
      let w = spanWidth(colW, cell.col - 1, cell.colSpan);
      const h = spanHeight(rowH, cell.row - 1, cell.rowSpan);
      if (cell.overflow) {
        // Como Excel: el texto sigue sobre las celdas vacías de la derecha.
        let extra = 0;
        for (let c = cell.col; c < colW.length; c += 1) {
          const occupied = model.cells.some((o) => o.row === cell.row && o.col === c + 1 && (o.text || o.fill));
          if (occupied) break;
          extra += colW[c];
        }
        w += extra;
      }
      let size = cell.fontSize * scale;
      doc.font(fontFor(cell)).fontSize(size).fillColor(cell.color);
      const innerW = Math.max(4, w - CELL_PAD * 2);
      let lines: string[];
      if (cell.wrap) {
        lines = wrapLines(doc, cell.text, innerW);
      } else {
        // Encoger un poco antes de cortar: un encabezado completo vale más que un «...».
        const flat = cell.text.replace(/\s+/g, ' ').trim();
        while (doc.widthOfString(flat) > innerW - 1 && size > cell.fontSize * scale * SHRINK_TO) {
          size -= 0.25;
          doc.fontSize(size);
        }
        lines = [fit(doc, flat, innerW)];
      }
      const lineH = size * 1.2;
      const textH = lines.length * lineH;
      let ty = cell.valign === 'top' ? y + CELL_PAD : cell.valign === 'middle' ? y + (h - textH) / 2 : y + h - textH - CELL_PAD * 0.6;
      ty = Math.max(y + 1, ty);
      for (const line of lines) {
        if (ty + lineH > clipBottom + 1 || ty < clipTop - 1) {
          ty += lineH;
          continue;
        }
        const lw = doc.widthOfString(line);
        const tx = cell.align === 'center' ? x + (w - lw) / 2 : cell.align === 'right' ? x + w - CELL_PAD - lw : x + CELL_PAD;
        doc.text(line, tx, ty + (lineH - size) / 2, { lineBreak: false });
        ty += lineH;
      }
    }

    // 4) Bordes (encima del relleno y del texto, como en Excel).
    for (const cell of model.cells) {
      if (!inRange(cell)) continue;
      const x = originX + colX[cell.col - 1];
      const y = yOf(cell.row - 1);
      const w = spanWidth(colW, cell.col - 1, cell.colSpan);
      const h = spanHeight(rowH, cell.row - 1, cell.rowSpan);
      const b = cell.border;
      const line = (x1: number, y1: number, x2: number, y2: number, side: { width: number; color: string }) => {
        doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(side.width).strokeColor(side.color).stroke();
      };
      if (b.top && y >= clipTop - 0.5) line(x, y, x + w, y, b.top);
      if (b.bottom && y + h <= clipBottom + 0.5) line(x, y + h, x + w, y + h, b.bottom);
      const y1 = Math.max(y, clipTop);
      const y2 = Math.min(y + h, clipBottom);
      if (y2 > y1) {
        if (b.left) line(x, y1, x, y2, b.left);
        if (b.right) line(x + w, y1, x + w, y2, b.right);
      }
    }
  }
}

/* ── Utilidades ────────────────────────────────────────────────────────── */

function prefix(values: number[]): number[] {
  const out = [0];
  for (const v of values) out.push(out[out.length - 1] + v);
  return out;
}

function spanWidth(colW: number[], from0: number, span: number): number {
  let w = 0;
  for (let c = from0; c < Math.min(colW.length, from0 + span); c += 1) w += colW[c];
  return w;
}

function spanHeight(rowH: number[], from0: number, span: number): number {
  let h = 0;
  for (let r = from0; r < Math.min(rowH.length, from0 + span); r += 1) h += rowH[r];
  return h;
}

function fontFor(cell: CellBox): string {
  if (cell.bold && cell.italic) return BOLD_ITALIC;
  if (cell.bold) return BOLD;
  if (cell.italic) return ITALIC;
  return FONT;
}

function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\n\x20-\x7E -ÿ]/g, '');
}

function fit(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  const t = safe(text).replace(/\s+/g, ' ').trim();
  const limit = Math.max(4, maxWidth - 1);
  if (doc.widthOfString(t) <= limit) return t;
  let out = t;
  while (out.length > 1 && doc.widthOfString(`${out}...`) > limit) out = out.slice(0, -1);
  return `${out.trimEnd()}...`;
}

function wrapLines(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string[] {
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
      if (doc.widthOfString(next) <= maxWidth) line = next;
      else {
        if (line) out.push(line);
        line = doc.widthOfString(word) <= maxWidth ? word : fit(doc, word, maxWidth);
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}
