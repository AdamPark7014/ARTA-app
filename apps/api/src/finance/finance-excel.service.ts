import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { existsSync } from 'fs';
import { join } from 'path';
import { uploadRoot } from '../uploads/upload-storage';

@Injectable()
export class FinanceExcelService {
  async buildFromTemplate(templatePath: string, eventName: string): Promise<{ excelPath: string }> {
    if (!existsSync(templatePath)) throw new NotFoundException('Plantilla de corrida no encontrada');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0] || wb.addWorksheet('Corrida');
    // Poner nombre del evento en alguna celda visible (heurística: buscar 'EVENTO' y escribir al lado; si no, A1)
    let written = false;
    const getText = (cell: ExcelJS.Cell) => {
      const v = cell.value as any;
      if (v == null) return '';
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (v && v.result != null) return String(v.result);
      try {
        return String((cell as any).text || '');
      } catch {
        return '';
      }
    };
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r += 1) {
      for (let c = 1; c <= Math.min(ws.columnCount, 10); c += 1) {
        const t = getText(ws.getRow(r).getCell(c)).trim();
        if (/evento/i.test(t)) {
          ws.getRow(r).getCell(c + 1).value = eventName;
          written = true;
          break;
        }
      }
      if (written) break;
    }
    if (!written) ws.getRow(1).getCell(1).value = eventName;
    const outName = `corrida-${Date.now()}.xlsx`;
    const excelPath = join(uploadRoot, outName);
    await wb.xlsx.writeFile(excelPath);
    return { excelPath };
  }
}

