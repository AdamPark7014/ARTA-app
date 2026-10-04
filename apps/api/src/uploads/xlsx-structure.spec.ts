import * as ExcelJS from 'exceljs';
import { XlsxPatchService } from './xlsx-patch.service';
import { buildSheetModel } from './sheet-layout';

/**
 * Correcciones 30-09-2026 (Campañas): insertar o eliminar filas y columnas no
 * debe «mover todo el orden». Libro con la forma de una campaña: encabezado
 * negro, conceptos con borde, TOTAL combinado con banda negra y la suma.
 */
describe('XlsxPatchService · filas y columnas', () => {
  const service = new XlsxPatchService();
  const BLACK = 'FF000000';

  async function campaign(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoja1');
    const resumen = wb.addWorksheet('Resumen');
    ws.columns = [{ width: 30 }, { width: 40 }, { width: 12 }, { width: 16 }];

    ws.mergeCells('A1:D1');
    ws.getCell('A1').value = 'CAMPAÑA YAHIR PUEBLA';
    ws.getCell('A1').font = { bold: true, size: 14 };

    ['MEDIO', 'DESCRIPCIÓN', 'CANT', 'COSTO'].forEach((h, i) => {
      const c = ws.getCell(2, i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
    });

    const rows = [
      ['CRUZ DEL SUR', 'PRESENCIA EN MUPPI', 1, 1000],
      ['QUE HACER EN PUEBLA', 'REDES SOCIALES', 2, 500],
      ['LIVERPOOL', 'PRESENCIA EN SUCURSALES', 1, 3000],
    ];
    rows.forEach((values, i) => {
      values.forEach((v, j) => {
        const c = ws.getCell(3 + i, j + 1);
        c.value = v;
        c.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
      });
    });

    ws.mergeCells('A6:C6');
    ws.getCell('A6').value = 'TOTAL';
    for (let c = 1; c <= 4; c += 1) {
      ws.getCell(6, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
    }
    ws.getCell('D6').value = { formula: 'SUM(D3:D5)', result: 4500 };
    ws.getRow(6).height = 24;

    resumen.getCell('A1').value = 'Total campaña';
    resumen.getCell('B1').value = { formula: 'Hoja1!D6', result: 4500 };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async function read(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    return wb;
  }

  const fillOf = (ws: ExcelJS.Worksheet, ref: string) =>
    (ws.getCell(ref).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
  const formulaOf = (ws: ExcelJS.Worksheet, ref: string) => (ws.getCell(ref).value as { formula?: string })?.formula;

  it('un concepto nuevo arriba del TOTAL: el total baja entero y su suma lo incluye', async () => {
    const out = await service.applyCellPatch(await campaign(), {
      ops: [{ sheet: 'Hoja1', kind: 'insertRows', at: 6, count: 1, styleFrom: 'before' }],
      cells: [
        { sheet: 'Hoja1', ref: 'A6', value: 'OCHO 30' },
        { sheet: 'Hoja1', ref: 'D6', value: 800 },
      ],
    });
    const wb = await read(out);
    const ws = wb.getWorksheet('Hoja1')!;

    expect(ws.getCell('A6').value).toBe('OCHO 30');
    // La fila nueva se ve como LIVERPOOL (borde), no como el TOTAL negro.
    expect(fillOf(ws, 'A6')).toBeUndefined();
    expect(ws.getCell('B6').border?.bottom?.style).toBe('thin');

    expect(ws.getCell('A7').value).toBe('TOTAL');
    expect(fillOf(ws, 'D7')).toBe(BLACK);
    expect(ws.model.merges).toEqual(expect.arrayContaining(['A1:D1', 'A7:C7']));
    expect(ws.model.merges).not.toContain('A6:C6');
    expect(formulaOf(ws, 'D7')).toBe('SUM(D3:D6)');
    expect(ws.getRow(7).height).toBe(24);

    expect(formulaOf(wb.getWorksheet('Resumen')!, 'B1')).toBe('Hoja1!D7');
  });

  it('eliminar una fila sube lo de abajo con su formato y encoge la suma', async () => {
    const out = await service.applyCellPatch(await campaign(), {
      ops: [{ sheet: 'Hoja1', kind: 'deleteRows', at: 4, count: 1 }],
    });
    const ws = (await read(out)).getWorksheet('Hoja1')!;
    expect(ws.getCell('A4').value).toBe('LIVERPOOL');
    expect(ws.getCell('A5').value).toBe('TOTAL');
    expect(fillOf(ws, 'A5')).toBe(BLACK);
    expect(fillOf(ws, 'A6')).toBeUndefined();
    expect(ws.model.merges).toContain('A5:C5');
    expect(formulaOf(ws, 'D5')).toBe('SUM(D3:D4)');
  });

  it('insertar una columna recorre valores, anchos y combinadas', async () => {
    const out = await service.applyCellPatch(await campaign(), {
      ops: [{ sheet: 'Hoja1', kind: 'insertCols', at: 3, count: 1, styleFrom: 'before' }],
    });
    const ws = (await read(out)).getWorksheet('Hoja1')!;
    expect(ws.getCell('D2').value).toBe('CANT');
    expect(ws.getCell('E2').value).toBe('COSTO');
    expect(ws.getCell('C2').value).toBeNull();
    // El encabezado de la columna nueva se ve como el de su vecina.
    expect(fillOf(ws, 'C2')).toBe(BLACK);
    expect(ws.getColumn(5).width).toBe(16);
    expect(ws.model.merges).toEqual(expect.arrayContaining(['A1:E1', 'A6:D6']));
    expect(formulaOf(ws, 'E6')).toBe('SUM(E3:E5)');
  });

  it('el panel ve la hoja ya ordenada (mismo modelo que el PDF)', async () => {
    const out = await service.applyCellPatch(await campaign(), {
      ops: [{ sheet: 'Hoja1', kind: 'insertRows', at: 6, count: 2, styleFrom: 'before' }],
    });
    const wb = await read(out);
    const model = buildSheetModel(wb.getWorksheet('Hoja1')!, wb);
    const total = model.cells.find((c) => c.text === 'TOTAL');
    expect(total).toMatchObject({ row: 8, col: 1, colSpan: 3 });
  });

  it('varias operaciones seguidas, en orden', async () => {
    const out = await service.applyCellPatch(await campaign(), {
      ops: [
        { sheet: 'Hoja1', kind: 'insertRows', at: 3, count: 1, styleFrom: 'after' },
        { sheet: 'Hoja1', kind: 'deleteRows', at: 5, count: 1 },
      ],
    });
    const ws = (await read(out)).getWorksheet('Hoja1')!;
    expect(ws.getCell('A4').value).toBe('CRUZ DEL SUR');
    expect(ws.getCell('A5').value).toBe('LIVERPOOL');
    expect(formulaOf(ws, 'D6')).toBe('SUM(D3:D5)');
  });

  it('hojas nuevas y renombradas desde el panel van antes que filas y celdas', async () => {
    const out = await service.applyCellPatch(await campaign(), {
      sheets: [{ add: 'Hoja2' }, { rename: { from: 'Hoja1', to: 'Puebla' } }],
      ops: [{ sheet: 'Puebla', kind: 'insertRows', at: 3, count: 1, styleFrom: 'after' }],
      cells: [
        { sheet: 'Hoja2', ref: 'A1', value: 'Notas' },
        { sheet: 'Puebla', ref: 'A3', value: 'NUEVO' },
      ],
    });
    const wb = await read(out);
    expect(wb.getWorksheet('Hoja2')!.getCell('A1').value).toBe('Notas');
    expect(wb.getWorksheet('Puebla')!.getCell('A3').value).toBe('NUEVO');
    expect(wb.getWorksheet('Puebla')!.getCell('A4').value).toBe('CRUZ DEL SUR');
    await expect(
      service.applyCellPatch(await campaign(), { sheets: [{ rename: { from: 'Hoja1', to: 'Resumen' } }] }),
    ).rejects.toThrow('Ya existe');
  });

  it('rechaza operaciones mal formadas y describe el cambio para el historial', async () => {
    await expect(
      service.applyCellPatch(await campaign(), {
        ops: [{ sheet: 'Hoja1', kind: 'insertRows', at: 0, count: 1 }],
      }),
    ).rejects.toThrow('Posición inválida');
    await expect(
      service.applyCellPatch(await campaign(), {
        ops: [{ sheet: 'NoExiste', kind: 'insertRows', at: 2, count: 1 }],
      }),
    ).rejects.toThrow('no existe');
    expect(
      service.describePatch({
        ops: [{ sheet: 'Hoja1', kind: 'insertRows', at: 2, count: 2 }],
        cells: [{ sheet: 'Hoja1', ref: 'A2', value: 'x' }],
      }),
    ).toBe('2 filas insertadas · 1 celda editada');
  });
});
