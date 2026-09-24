import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { uploadRoot } from './upload-storage';
import { ExcelPdfService } from './excel-pdf.service';
import { CampaignExcelService } from '../campaigns/campaign-excel.service';
import { FinanceExcelService } from '../finance/finance-excel.service';

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function campaignAssetPath(): string {
  const repoRoot = path.resolve(process.cwd(), '..', '..');
  return path.join(repoRoot, 'apps', 'api', 'assets', 'format-sources', 'CAMPANA_BASE.xlsx');
}

function corridaAssetPath(): string {
  const repoRoot = path.resolve(process.cwd(), '..', '..');
  return path.join(repoRoot, 'apps', 'api', 'assets', 'format-sources', 'CORRIDA_BASE.xlsx');
}

describe('Excel template services (campaign/corrida)', () => {
  it('builds campaign from real template preserving merges, headers, formulas and tally labels', async () => {
    const src = campaignAssetPath();
    expect(fs.existsSync(src)).toBe(true);
    const svc = new CampaignExcelService();
    const { excelPath } = await svc.buildFromTemplate(src, { eventName: 'PRUEBA', date: '2026-09-24' }, [
      { concept: 'VALLAS', qty: 2, precioExterno: 100, precioInterno: 80 },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(excelPath);
    const ws = wb.worksheets[0];
    // Helper lectura segura de texto
    const text = (cell: ExcelJS.Cell) => {
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
    // Título: buscar en la primera fila
    const row1Text = Array.from({ length: ws.columnCount }, (_, c) => text(ws.getRow(1).getCell(c + 1)).toUpperCase()).join(' ');
    expect(row1Text).toContain('GASTOS DE PUBLICIDAD Y CONVENIOS');
    // Merges esperados (al menos 20 en el machote real)
    expect((ws.model.merges || []).length).toBeGreaterThanOrEqual(20);
    // Encabezado en fila 5
    expect(ws.getRow(5).getCell(1).text.toUpperCase().trim()).toBe('CONCEPTO');
    expect(ws.getRow(5).getCell(2).text.toUpperCase()).toContain('CANTIDAD');
    expect(ws.getRow(5).getCell(3).text.toUpperCase().trim()).toBe('COSTO');
    expect(ws.getRow(5).getCell(4).text.toUpperCase()).toContain('COSTO TOTAL');
    // Primera fila de datos (fila 6) debe tener fórmulas D=B*C y G=E*F (si la fila existe)
    const d6 = ws.getCell('D6').value as ExcelJS.CellFormulaValue | ExcelJS.CellValue;
    const g6 = ws.getCell('G6').value as ExcelJS.CellFormulaValue | ExcelJS.CellValue;
    const dFormula = typeof d6 === 'object' && d6 && 'formula' in d6;
    const gFormula = typeof g6 === 'object' && g6 && 'formula' in g6;
    expect(dFormula || gFormula).toBeTruthy();
    // Tally de boletaje (zonas)
    const labels = new Set<string>();
    ws.eachRow({ includeEmpty: false }, (row) => {
      const t = String(row.getCell(1).text || '').trim().toUpperCase();
      if (t) labels.add(t);
    });
    expect(['PLATINO', 'DORADA', 'BLANCA', 'LILA', 'TOTAL'].some((k) => labels.has(k))).toBe(true);
    const pdf = new ExcelPdfService();
    const { filePath } = await pdf.generate('test-campaign', 1, excelPath, {
      eventName: 'PRUEBA',
      entity: 'ARTA',
      fileName: 'CAMPANA PRUEBA.xlsx',
      exportedBy: null,
    });
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('builds corrida from real template and preserves FUNCIONES, headers and RESULTADO formulas', async () => {
    const src = corridaAssetPath();
    expect(fs.existsSync(src)).toBe(true);
    const svc = new FinanceExcelService();
    const { excelPath } = await svc.buildFromTemplate(src, 'PRUEBA');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(excelPath);
    const ws = wb.worksheets[0];
    expect((ws.model.merges || []).length).toBeGreaterThan(0);
    // FUNCIONES en la fila 2 (en alguna columna)
    const text2 = (cell: ExcelJS.Cell) => {
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
    const row2Text = Array.from({ length: ws.columnCount }, (_, c) => text2(ws.getRow(2).getCell(c + 1)).toUpperCase()).join(' ');
    expect(row2Text).toContain('FUNCIONES');
    // Encabezado de escenarios (1, 0.9, ..., 0.2) aparece en alguna fila de encabezado (buscar la fila con 'AFORO'/'PRECIO')
    let headerRow = -1;
    for (let r = 1; r <= Math.min(ws.rowCount, 12); r += 1) {
      const cells = Array.from({ length: Math.min(ws.columnCount, 16) }, (_, c) =>
        String(ws.getRow(r).getCell(c + 1).value ?? '').toString().toLowerCase(),
      );
      if (cells.some((t) => t.includes('aforo'))) {
        headerRow = r;
        break;
      }
    }
    expect(headerRow).toBeGreaterThan(0);
    const headers = Array.from({ length: 10 }, (_, i) => (i === 0 ? '1' : (1 - i * 0.1).toFixed(1)));
    const rowTexts = Array.from({ length: 16 }, (_, c) =>
      String(ws.getRow(headerRow).getCell(c + 1).value ?? '').toString().toLowerCase(),
    );
    expect(rowTexts.some((t) => t.includes('aforo'))).toBe(true);
    expect(rowTexts.some((t) => t.includes('precio'))).toBe(true);
    expect(headers.some((h) => rowTexts.includes(h))).toBe(true);
    // RESULTADO: fila con la etiqueta y alguna fórmula en esa fila
    let resultadoRowIdx = -1;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const hasResultado = Array.from({ length: Math.min(ws.columnCount, 16) }, (_, c) =>
        String(row.getCell(c + 1).value ?? '').toString().toUpperCase(),
      ).some((t) => t.includes('RESULTADO'));
      if (hasResultado) resultadoRowIdx = n;
    });
    expect(resultadoRowIdx).toBeGreaterThan(0);
    const anyFormula = Array.from({ length: Math.min(ws.columnCount, 12) }, (_, c) => ws.getRow(resultadoRowIdx).getCell(c + 1).value).some(
      (v) => typeof v === 'object' && v && 'formula' in v,
    );
    expect(anyFormula).toBe(true);
    const pdf = new ExcelPdfService();
    const { filePath } = await pdf.generate('test-corrida', 1, excelPath, {
      eventName: 'PRUEBA',
      entity: 'ARTA',
      fileName: 'CORRIDA PRUEBA.xlsx',
      exportedBy: null,
    });
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

