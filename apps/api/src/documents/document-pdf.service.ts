import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PdfBrandingService, type BrandingMeta } from '../uploads/pdf-branding.service';

export type DocBlockType = 'h1' | 'h2' | 'p' | 'bullet' | 'divider';

export type DocBlock = { type: DocBlockType; text: string };

const BLOCK_TYPES: DocBlockType[] = ['h1', 'h2', 'p', 'bullet', 'divider'];

/** Sanea lo que llega del panel: nunca confiamos en el JSON del cliente. */
export function normalizeBlocks(raw: unknown): DocBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 2000)
    .map((b) => {
      const block = b as Partial<DocBlock>;
      const type = BLOCK_TYPES.includes(block?.type as DocBlockType)
        ? (block!.type as DocBlockType)
        : 'p';
      const text = typeof block?.text === 'string' ? block.text.slice(0, 20000) : '';
      return { type, text };
    })
    .filter((b) => b.type === 'divider' || b.text.trim().length > 0 || b.type === 'p');
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
      const doc = new PDFDocument({ size: 'LETTER', margin: 56 });
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
      this.branding.drawHeaderFooter(doc, meta, right - left, 100);
      if (input.draftWatermark) this.branding.draftWatermark(doc);
      doc.moveDown(4.6);

      const accent = input.entity === 'EXPLANADA' ? '#1f5c50' : '#8b6914';
      for (const block of input.blocks) {
        if (doc.y > bottom) doc.addPage();

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

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    return { url: `/uploads/documents/${documentId}-v${version}.pdf`, filePath, fileName };
  }
}
