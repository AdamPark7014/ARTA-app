import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { existsSync } from 'fs';
import { join } from 'path';
import { uploadRoot } from '../uploads/upload-storage';

export type CampaignRow = {
  concept: string;
  qty?: number | null;
  precioInterno?: number | null;
  precioExterno?: number | null;
};

export type CampaignMeta = {
  promoter?: string | null;
  eventName: string;
  date?: string | null;
  venue?: string | null;
  schedule?: string | null;
  city?: string | null;
};

@Injectable()
export class CampaignExcelService {
  private cellText(cell: ExcelJS.Cell): string {
    const v = cell.value as any;
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v && Array.isArray(v.richText)) return v.richText.map((x: { text: string }) => x.text).join('');
    if (v && v.result != null) return String(v.result);
    try {
      return String((cell as any).text || '');
    } catch {
      return '';
    }
  }
  private setRightCellAfterLabel(ws: ExcelJS.Worksheet, labelRe: RegExp, value: string) {
    for (let r = 1; r <= Math.min(ws.rowCount, 12); r += 1) {
      for (let c = 1; c <= Math.min(ws.columnCount, 10); c += 1) {
        const t = this.cellText(ws.getRow(r).getCell(c)).trim();
        if (labelRe.test(t)) {
          ws.getRow(r).getCell(c + 1).value = value;
          return;
        }
      }
    }
  }

  async buildFromTemplate(templatePath: string, meta: CampaignMeta, rows: CampaignRow[]): Promise<{ excelPath: string }> {
    if (!existsSync(templatePath)) throw new NotFoundException('Plantilla de campaña no encontrada');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0] || wb.addWorksheet('Campaña');

    // Meta (filas 1–4): buscar por etiqueta y escribir a la derecha
    this.setRightCellAfterLabel(ws, /Promotor/i, meta.promoter || '');
    this.setRightCellAfterLabel(ws, /Evento/i, meta.eventName || '');
    this.setRightCellAfterLabel(ws, /Fecha/i, meta.date || '');
    this.setRightCellAfterLabel(ws, /Venue/i, meta.venue || '');
    this.setRightCellAfterLabel(ws, /Horario/i, meta.schedule || '');
    this.setRightCellAfterLabel(ws, /Ciudad/i, meta.city || '');

    // Encabezado en fila 5; escribir conceptos desde fila 6
    const startRow = 6;
    let rIdx = startRow;
    for (const r of rows) {
      if (!r.concept.trim?.()) continue;
      const row = ws.getRow(rIdx++);
      // Columnas (B..I): CANTIDAD | COSTO | COSTO TOTAL | CANTIDAD ARTA | COSTO ARTA | COSTO TOTAL ARTA | PAGADO | POR PAGAR
      // Dejar TOTAL y TOTAL ARTA a sus fórmulas si existen
      row.getCell(2).value = r.qty ?? null; // B CANTIDAD
      row.getCell(3).value = r.precioExterno ?? null; // C COSTO
      // D: si ya trae fórmula la conservamos; si no, queda vacío para que calcule manualmente
      row.getCell(5).value = r.qty ?? null; // E CANTIDAD ARTA
      row.getCell(6).value = r.precioInterno ?? null; // F COSTO ARTA
      // G: fórmula o queda vacío
      // H/I pagado/por pagar — se dejan en blanco
      // Primera columna (A) es CONCEPTO si el template así lo define; algunas plantillas tienen encabezado en B:5
      // Escribir concepto en la columna anterior a CANTIDAD si está vacía
      const maybeConceptCol = 1;
      const headConcept = this.cellText(ws.getRow(5).getCell(maybeConceptCol)).trim();
      if (/concepto/i.test(headConcept)) {
        row.getCell(maybeConceptCol).value = r.concept;
      } else {
        // Si el concepto está en B (desplaza), escribe en B y corre numéricos a la derecha
        // Para no romper el layout, si B5 tiene "CANTIDAD", dejamos así: el concepto vive en A
        row.getCell(1).value = r.concept;
      }
      row.commit();
    }

    const outName = `campaign-${Date.now()}.xlsx`;
    const excelPath = join(uploadRoot, outName);
    await wb.xlsx.writeFile(excelPath);
    return { excelPath };
  }
}

