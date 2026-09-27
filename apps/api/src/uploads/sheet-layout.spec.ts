import * as ExcelJS from 'exceljs';
import { join } from 'path';
import { buildSheetModel, formatNumber, formulaOfCell, shiftFormula, type CellBox } from './sheet-layout';

/**
 * Los libros base del cliente (`assets/format-sources`) son la prueba: lo que
 * salía mal en el PDF (título combinado repetido 25 veces, fórmulas vacías,
 * anchos iguales) tiene que quedar resuelto en el modelo, sin pdfkit.
 */
const SOURCES = join(__dirname, '..', '..', 'assets', 'format-sources');

async function load(name: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(SOURCES, name));
  return { wb, ws: wb.worksheets[0] };
}

const at = (cells: CellBox[], row: number, col: number) => cells.find((c) => c.row === row && c.col === col);

describe('sheet-layout · fórmulas', () => {
  it('traslada fórmulas compartidas como Excel y respeta los $', () => {
    expect(shiftFormula('SUM(C8:C17)', 0, 1)).toBe('SUM(D8:D17)');
    expect(shiftFormula('B5*C5*G2', 3, 0)).toBe('B8*C8*G5');
    expect(shiftFormula('B5*C5*$G$2', 3, 0)).toBe('B8*C8*$G$2');
    expect(shiftFormula('IF(A1="x",1,0)', 1, 1)).toBe('IF(B2="x",1,0)');
  });

  it('formatea moneda, porcentaje y enteros a la mexicana', () => {
    expect(formatNumber(541800, '_-"$"* #,##0.00_-;-"$"* #,##0.00_-;_-"$"* "-"??_-;_-@')).toBe('$541,800.00');
    expect(formatNumber(0.9, '0%')).toBe('90%');
    expect(formatNumber(625, '#,##0')).toBe('625');
    expect(formatNumber(1234.5, undefined)).toBe('1,234.5');
  });
});

describe('sheet-layout · Distribución de pendones', () => {
  it('la celda combinada del título sale una sola vez, con su alcance', async () => {
    const { wb, ws } = await load('DISTRIBUCION_PENDONES.xlsx');
    const model = buildSheetModel(ws, wb);
    const titles = model.cells.filter((c) => /DISTRIBUCI/i.test(c.text));
    expect(titles).toHaveLength(1);
    expect(titles[0]).toMatchObject({ row: 1, col: 1, rowSpan: 5, colSpan: 5, bold: true, align: 'center' });
    // Ninguna celda esclava de la combinación aparece.
    expect(model.cells.some((c) => c.row === 2 && c.col === 2)).toBe(false);
    // Anchos del libro, no iguales.
    expect(model.colWidths[2]).toBeGreaterThan(model.colWidths[0] * 2);
    expect(model.images).toHaveLength(2);
  });

  it('las sumas sin resultado guardado se calculan y las compartidas se trasladan', async () => {
    const { wb, ws } = await load('DISTRIBUCION_PENDONES.xlsx');
    ws.getCell('C8').value = 10;
    ws.getCell('C9').value = 5;
    ws.getCell('D8').value = 7;
    ws.getCell('E10').value = 2;
    expect(formulaOfCell(ws, 18, 4)).toBe('SUM(D8:D17)');
    const model = buildSheetModel(ws, wb);
    expect(at(model.cells, 18, 3)?.text).toBe('15');
    expect(at(model.cells, 18, 4)?.text).toBe('7');
    expect(at(model.cells, 18, 5)?.text).toBe('2');
    // TOTAL = C18+D18+E18, en la celda combinada C19:E19.
    const total = at(model.cells, 19, 3);
    expect(total?.text).toBe('24');
    expect(total?.colSpan).toBe(3);
  });
});

describe('sheet-layout · Corrida y Campaña', () => {
  it('la corrida trae moneda, porcentajes, texto claro sobre banda oscura e imagen', async () => {
    const { wb, ws } = await load('CORRIDA_BASE.xlsx');
    const model = buildSheetModel(ws, wb);
    expect(at(model.cells, 5, 4)?.text).toBe('$541,800.00');
    expect(at(model.cells, 4, 5)?.text).toBe('90%');
    const banda = at(model.cells, 3, 1);
    expect(banda?.text).toBe('INGRESOS');
    expect(banda?.colSpan).toBe(12);
    expect(banda?.fill).toBe('#000000');
    expect(banda?.color).toBe('#FFFFFF');
    expect(model.images.length).toBeGreaterThanOrEqual(1);
  });

  it('la campaña pide apaisado y calcula las fórmulas compartidas de COSTO TOTAL', async () => {
    const { wb, ws } = await load('CAMPANA_BASE.xlsx');
    const model = buildSheetModel(ws, wb);
    expect(model.orientation).toBe('landscape');
    expect(at(model.cells, 6, 4)?.text).toBe('$11,000.00');
    expect(at(model.cells, 7, 4)?.text).toBe('$15,000.00');
    const head = at(model.cells, 5, 1);
    expect(head?.fill).toBe('#393939');
    expect(head?.color).toBe('#FFFFFF');
    expect(model.totalWidth).toBeGreaterThan(540);
  });
});
