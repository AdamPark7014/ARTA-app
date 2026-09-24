import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { uploadRoot } from './upload-storage';

type SheetPdfInput = {
  eventName: string;
  entity: string;
  fileName: string;
  exportedBy?: string | null;
};

/**
 * Excel embebido → PDF de salida.
 *
 * La copia de trabajo sigue siendo el .xlsx dentro del sistema; lo que «sale»
 * (compartir, imprimir, entregar) es este PDF. Así se evita que circulen
 * ediciones fuera del panel sin auditoría.
 */
@Injectable()
export class ExcelPdfService {
  private dir() {
    const dir = join(uploadRoot, 'sheet-pdfs');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  async generate(
    sourceFileId: string,
    version: number,
    sourcePath: string,
    input: SheetPdfInput,
  ): Promise<{ url: string; filePath: string; fileName: string }> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(sourcePath);
    } catch {
      throw new BadRequestException('No se pudo leer el Excel para generar el PDF');
    }

    const dir = this.dir();
    const fileName = `${sourceFileId}-v${version}.pdf`;
    const filePath = join(dir, fileName);

    await new Promise<void>((resolve, reject) => {
      // Landscape: las hojas de campaña/corrida son anchas.
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 36 });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      doc.on('error', reject);

      const accent = input.entity === 'EXPLANADA' ? '#1f5c50' : '#8b6914';
      const left = 36;
      const pageWidth = 792 - 72; // landscape letter usable width

      const writeHeader = (sheetName: string) => {
        doc
          .fillColor(accent)
          .fontSize(10)
          .text(
            input.entity === 'EXPLANADA' ? 'AUDITORIO AREMA · EXPLANADA' : 'ARTA PRODUCCIONES',
            left,
            28,
          );
        doc
          .fillColor('#111')
          .fontSize(14)
          .text(input.eventName || 'Evento', left, 44, { width: pageWidth });
        doc
          .fillColor('#555')
          .fontSize(9)
          .text(
            `Salida PDF · ${input.fileName} · hoja «${sheetName}»` +
              (input.exportedBy ? ` · ${input.exportedBy}` : '') +
              ` · v${version}`,
            left,
            64,
            { width: pageWidth },
          );
        doc.moveTo(left, 78).lineTo(left + pageWidth, 78).strokeColor('#ccc').stroke();
      };

      let first = true;
      const cellText = (cell: ExcelJS.Cell): string => {
        const v = (cell as any).value as any;
        if (v == null) return '';
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
        if (v && v.result != null) return String(v.result);
        if (v && Array.isArray(v.richText)) return v.richText.map((x: { text: string }) => x.text).join('');
        try {
          return String((cell as any).text || '');
        } catch {
          return '';
        }
      };

      for (const ws of wb.worksheets) {
        if (!first) doc.addPage();
        first = false;
        writeHeader(ws.name);

        const rows: string[][] = [];
        let maxCol = 1;
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber > 80) return; // tope por hoja
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber > 12) return;
            maxCol = Math.max(maxCol, colNumber);
            const text = cellText(cell);
            cells[colNumber - 1] = text.slice(0, 80);
          });
          // normalizar longitud
          for (let c = 0; c < maxCol; c += 1) {
            if (cells[c] == null) cells[c] = '';
          }
          rows.push(cells.slice(0, maxCol));
        });

        if (!rows.length) {
          doc.fillColor('#888').fontSize(11).text('(Hoja vacía)', left, 100);
          continue;
        }

        const colCount = Math.min(maxCol, 12);
        const colW = pageWidth / colCount;
        let y = 90;
        const rowH = 16;

        for (let r = 0; r < rows.length; r += 1) {
          if (y > 560) {
            doc.addPage();
            writeHeader(ws.name);
            y = 90;
          }
          const isHeader = r === 0 || /^concepto|total|ingresos|egresos/i.test(rows[r][0] || '');
          if (isHeader) {
            doc.rect(left, y - 2, pageWidth, rowH).fill('#f0f2f5');
          }
          for (let c = 0; c < colCount; c += 1) {
            const raw = rows[r][c] || '';
            doc
              .fillColor(isHeader ? '#222' : '#333')
              .fontSize(isHeader ? 8 : 7.5)
              .text(raw, left + c * colW + 2, y, {
                width: colW - 4,
                height: rowH - 2,
                ellipsis: true,
              });
          }
          y += rowH;
          doc
            .moveTo(left, y - 2)
            .lineTo(left + pageWidth, y - 2)
            .strokeColor('#e6e9ee')
            .lineWidth(0.4)
            .stroke();
        }
      }

      if (first) {
        // workbook sin hojas
        writeHeader('(sin hojas)');
        doc.fillColor('#888').fontSize(11).text('El libro no tiene hojas para exportar.', left, 100);
      }

      doc.end();
    });

    return {
      url: `/uploads/sheet-pdfs/${fileName}`,
      filePath,
      fileName,
    };
  }
}
