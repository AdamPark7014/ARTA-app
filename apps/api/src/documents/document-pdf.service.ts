import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PdfBrandingService, type BrandingMeta } from '../uploads/pdf-branding.service';

export type DocTextType = 'h1' | 'h2' | 'p' | 'bullet' | 'divider';

export type DocTextBlock = { type: DocTextType; text: string };
/** Tabla del Word importado; se edita celda por celda y sale en el PDF. */
export type DocTableBlock = { type: 'table'; rows: string[][] };
export type DocBlock = DocTextBlock | DocTableBlock;

const TEXT_TYPES: DocTextType[] = ['h1', 'h2', 'p', 'bullet', 'divider'];
const MAX_TABLE_ROWS = 200;
const MAX_TABLE_COLS = 30;

/** Sanea lo que llega del panel: nunca confiamos en el JSON del cliente. */
export function normalizeBlocks(raw: unknown): DocBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 2000)
    .map((b): DocBlock => {
      const block = b as { type?: unknown; text?: unknown; rows?: unknown };
      if (block?.type === 'table' && Array.isArray(block.rows)) {
        const rows = (block.rows as unknown[])
          .slice(0, MAX_TABLE_ROWS)
          .map((row) =>
            (Array.isArray(row) ? row : [])
              .slice(0, MAX_TABLE_COLS)
              .map((cell) => (cell == null ? '' : String(cell)).slice(0, 2000)),
          );
        return { type: 'table', rows };
      }
      const type = TEXT_TYPES.includes(block?.type as DocTextType) ? (block.type as DocTextType) : 'p';
      const text = typeof block?.text === 'string' ? block.text.slice(0, 20000) : '';
      return { type, text };
    })
    .filter((b) => b.type === 'table' || b.type === 'divider' || b.text.trim().length > 0 || b.type === 'p');
}

type DocInput = {
  title: string;
  eventName: string;
  entity: string;
  blocks: DocBlock[];
  updatedBy?: string | null;
  updatedAt?: Date | null;
  draftWatermark?: boolean;
  folio?: string | null;
  status?: string | null;
};

/**
 * Documento tipo Word → PDF.
 *
 * Se escribe en el panel como bloques (títulos, párrafos, viñetas) y aquí se
 * imprime con la misma identidad visual que los PDF de checklist, para que lo
 * que se descarga parezca del mismo sistema.
 */
@Injectable()
export class DocumentPdfService {
  constructor(private branding: PdfBrandingService = new PdfBrandingService()) {}
  private dir() {
    const root = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const dir = join(root, 'documents');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  async generate(
    documentId: string,
    version: number,
    input: DocInput,
  ): Promise<{ url: string; filePath: string; fileName: string }> {
    const dir = this.dir();
    // Estandarizar nombre de archivo: <EVENTO>_<AAAAMMDD>_<FORMATO>_v<N>.pdf
    const safe = (s: string) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 80);
    const dateLabel = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileBase = `${safe(input.eventName)}_${dateLabel}_${safe(input.title)}_v${version}`.toUpperCase();
    const fileName = `${fileBase}.pdf`;
    const filePath = join(dir, `${documentId}-v${version}.pdf`); // keep stable path for linking history; return fileName for download UI

    await new Promise<void>((resolve, reject) => {
      // El margen de abajo deja libre el pie de página; `bufferPages` permite numerar al final.
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 56, left: 56, right: 56, bottom: 90 },
        bufferPages: true,
      });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      const left = 56;
      const right = 556;
      const bottom = 700;
      const meta: BrandingMeta = {
        entity: input.entity,
        eventName: input.eventName,
        fileName: input.title,
        version,
        generatedBy: input.updatedBy || null,
        generatedAt: input.updatedAt || new Date(),
        folio: input.folio || null,
        status: input.status || null,
      };
      // Pintar el pie deja el cursor hasta abajo: sin colocarlo, el contenido se iba a una
      // segunda página y la primera salía solo con el encabezado.
      const startAt = (top: number) => {
        if (input.draftWatermark) this.branding.draftWatermark(doc);
        doc.x = left;
        doc.y = top;
      };
      startAt(this.branding.drawHeaderFooter(doc, meta, right - left, 100));
      doc.on('pageAdded', () => startAt(this.branding.drawHeaderFooter(doc, meta, undefined, 100, { compact: true })));

      const accent = input.entity === 'EXPLANADA' ? '#1f5c50' : '#8b6914';
      for (const block of input.blocks) {
        if (doc.y > bottom) doc.addPage();

        if (block.type === 'table') {
          this.drawTable(doc, block.rows, left, right - left, bottom);
          continue;
        }

        if (block.type === 'divider') {
          doc.moveDown(0.4);
          doc
            .strokeColor('#d8d8d8')
            .lineWidth(1)
            .moveTo(left, doc.y)
            .lineTo(right, doc.y)
            .stroke();
          doc.moveDown(0.6);
          continue;
        }

        if (block.type === 'h1') {
          doc.moveDown(0.5);
          doc.fillColor('#111').fontSize(15).text(block.text, { width: right - left });
          doc.moveDown(0.3);
          continue;
        }

        if (block.type === 'h2') {
          doc.moveDown(0.4);
          doc.fillColor(accent).fontSize(12).text(block.text.toUpperCase(), {
            width: right - left,
          });
          doc.moveDown(0.25);
          continue;
        }

        if (block.type === 'bullet') {
          doc.fillColor('#222').fontSize(10.5).text(`•  ${block.text}`, {
            width: right - left - 12,
            indent: 12,
          });
          doc.moveDown(0.2);
          continue;
        }

        doc.fillColor('#222').fontSize(10.5).text(block.text, {
          width: right - left,
          align: 'left',
        });
        doc.moveDown(0.4);
      }

      this.branding.stampPageNumbers(doc);
      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    return { url: `/uploads/documents/${documentId}-v${version}.pdf`, filePath, fileName };
  }

  /** Tabla con líneas finas; la primera fila es el encabezado y se repite al cambiar de página. */
  private drawTable(doc: PDFKit.PDFDocument, rows: string[][], left: number, width: number, bottom: number) {
    const cols = rows.reduce((n, row) => Math.max(n, row.length), 0);
    if (!cols) return;
    const colWidth = width / cols;
    const pad = 5;
    const size = 9.5;

    const heightOf = (row: string[], bold: boolean) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
      const tallest = row.reduce(
        (h, cell) => Math.max(h, doc.heightOfString(cell || ' ', { width: colWidth - pad * 2 })),
        0,
      );
      return tallest + pad * 2;
    };

    const drawRow = (row: string[], bold: boolean) => {
      const height = heightOf(row, bold);
      const y = doc.y;
      if (bold) doc.rect(left, y, width, height).fill('#f1f0ed');
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#222');
      for (let c = 0; c < cols; c += 1) {
        doc.text(row[c] || '', left + c * colWidth + pad, y + pad, { width: colWidth - pad * 2, lineBreak: true });
      }
      doc.lineWidth(0.5).strokeColor('#c9c8c4');
      doc.rect(left, y, width, height).stroke();
      for (let c = 1; c < cols; c += 1) {
        doc
          .moveTo(left + c * colWidth, y)
          .lineTo(left + c * colWidth, y + height)
          .stroke();
      }
      doc.x = left;
      doc.y = y + height;
    };

    doc.moveDown(0.3);
    doc.x = left;
    rows.forEach((row, i) => {
      if (doc.y + heightOf(row, i === 0) > bottom + 20) {
        doc.addPage();
        if (i > 0) drawRow(rows[0], true);
      }
      drawRow(row, i === 0);
    });
    doc.font('Helvetica');
    doc.moveDown(0.6);
  }
}
