import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';

type ChecklistData = {
  sections?: Array<{
    id: string;
    title: string;
    items?: Array<{
      id: string;
      label: string;
      type?: string;
      done?: boolean;
      value?: string | number | null;
    }>;
  }>;
};

type SignaturePayload = {
  signerName?: string;
  imageDataUrl?: string;
  signedAt?: string;
};

type PdfInput = {
  title: string;
  eventName: string;
  entity: string;
  artist?: string | null;
  venue?: string | null;
  city?: string | null;
  templateKey?: string;
  data: ChecklistData;
  delivered?: SignaturePayload | null;
  authorized?: SignaturePayload | null;
  editedBy?: string | null;
  editedAt?: Date | null;
};

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

@Injectable()
export class ChecklistPdfService {
  private uploadRoot() {
    const root = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const dir = join(root, 'checklists');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  async generate(checklistId: string, input: PdfInput): Promise<{ url: string; filePath: string }> {
    const dir = this.uploadRoot();
    const fileName = `${checklistId}.pdf`;
    const filePath = join(dir, fileName);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      const accent = input.entity === 'EXPLANADA' ? '#1f5c50' : '#8b6914';

      doc.fillColor(accent).fontSize(11).text(input.entity === 'EXPLANADA' ? 'AUDITORIO AREMA · EXPLANADA' : 'ARTA PRODUCCIONES', {
        align: 'left',
      });
      doc.moveDown(0.3);
      doc.fillColor('#111').fontSize(18).text(input.title, { align: 'left' });
      doc.moveDown(0.35);
      doc.fontSize(10).fillColor('#444')
        .text(`Evento: ${input.eventName}`)
        .text([input.artist, input.venue, input.city].filter(Boolean).join(' · ') || '—')
        .text(`Plantilla: ${input.templateKey || 'CUSTOM'}`)
        .text(`Generado: ${new Date().toLocaleString('es-MX')}`);
      if (input.editedBy) {
        doc.text(`Última edición: ${input.editedBy}${input.editedAt ? ` · ${input.editedAt.toLocaleString('es-MX')}` : ''}`);
      }

      doc.moveDown(0.8);
      doc.strokeColor(accent).lineWidth(1.5).moveTo(48, doc.y).lineTo(564, doc.y).stroke();
      doc.moveDown(0.8);

      for (const section of input.data.sections || []) {
        if (doc.y > 680) doc.addPage();
        doc.fillColor(accent).fontSize(12).text(section.title.toUpperCase());
        doc.moveDown(0.35);
        doc.fillColor('#222').fontSize(10);

        for (const item of section.items || []) {
          if (doc.y > 720) doc.addPage();
          if (item.type === 'check' || !item.type) {
            const mark = item.done ? '[X]' : '[ ]';
            doc.text(`${mark}  ${item.label}`);
          } else {
            const val = item.value === null || item.value === undefined || item.value === '' ? '______________' : String(item.value);
            doc.text(`${item.label}: ${val}`);
          }
          doc.moveDown(0.2);
        }
        doc.moveDown(0.55);
      }

      // Firmas
      if (doc.y > 560) doc.addPage();
      doc.moveDown(0.5);
      doc.strokeColor(accent).lineWidth(1).moveTo(48, doc.y).lineTo(564, doc.y).stroke();
      doc.moveDown(0.7);
      doc.fillColor('#111').fontSize(12).text('FIRMAS DIGITALES');
      doc.moveDown(0.5);

      const colW = 240;
      const startY = doc.y;
      this.drawSignatureBlock(doc, 48, startY, colW, 'ENTREGADO', input.delivered);
      this.drawSignatureBlock(doc, 320, startY, colW, 'AUTORIZADO', input.authorized);

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    return { url: `/uploads/checklists/${fileName}`, filePath };
  }

  private drawSignatureBlock(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    label: string,
    sig?: SignaturePayload | null,
  ) {
    doc.fillColor('#666').fontSize(9).text(label, x, y);
    const img = dataUrlToBuffer(sig?.imageDataUrl);
    const imgY = y + 14;
    if (img) {
      try {
        doc.image(img, x, imgY, { fit: [width, 70] });
      } catch {
        doc.rect(x, imgY, width, 70).stroke('#ccc');
      }
    } else {
      doc.rect(x, imgY, width, 70).stroke('#ccc');
      doc.fillColor('#aaa').fontSize(8).text('Pendiente de firma', x + 8, imgY + 30);
    }
    const nameY = imgY + 78;
    doc.fillColor('#111').fontSize(9).text(sig?.signerName || '________________', x, nameY);
    if (sig?.signedAt) {
      doc.fillColor('#666').fontSize(8).text(new Date(sig.signedAt).toLocaleString('es-MX'), x, nameY + 12);
    }
  }

  /** Helper if we ever need to read an existing PDF buffer */
  readIfExists(checklistId: string): Buffer | null {
    const filePath = join(this.uploadRoot(), `${checklistId}.pdf`);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
  }
}

export type SignatureJson = Prisma.InputJsonValue;
