import * as ExcelJS from 'exceljs';
import { FinanceExtractService } from './finance-extract.service';

/**
 * El hueco que cierra esto: el panel llama al Excel «la corrida viva», pero el
 * servidor nunca lo leía. Los KPIs de dirección salían de `FinanceRun.dataJson`,
 * que casi siempre estaba vacío — el dashboard reportaba ceros con la corrida
 * llena.
 */
describe('FinanceExtractService.rowsFromWorkbook', () => {
  const service = new FinanceExtractService({} as never);

  /** Un libro con la forma de la plantilla real: meta arriba, tabla debajo. */
  async function buildCorrida(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();

    const resumen = wb.addWorksheet('Resumen');
    resumen.getCell('A1').value = 'CORRIDA FINANCIERA — RESUMEN';
    resumen.getCell('A8').value = 'Total ingresos';

    const ingresos = wb.addWorksheet('Ingresos');
    ingresos.getCell('A1').value = 'INGRESOS';
    ingresos.getCell('A3').value = 'Evento';
    ingresos.getCell('B3').value = 'Noche de Bandas';
    ingresos.getCell('A8').value = 'CONCEPTO';
    ingresos.getCell('B8').value = 'MONTO';
    ingresos.getCell('A9').value = 'Taquilla';
    ingresos.getCell('B9').value = 100000;
    ingresos.getCell('A10').value = 'Patrocinios';
    ingresos.getCell('B10').value = 50000;
    ingresos.getCell('A30').value = 'TOTAL';
    ingresos.getCell('B30').value = { formula: 'SUM(B9:B29)', result: 150000 };

    const egresos = wb.addWorksheet('Egresos');
    egresos.getCell('A8').value = 'CONCEPTO';
    egresos.getCell('B8').value = 'MONTO';
    egresos.getCell('A9').value = 'Audio';
    egresos.getCell('B9').value = 20000;
    egresos.getCell('A10').value = 'Hospitality';
    egresos.getCell('B10').value = 8000;
    egresos.getCell('A30').value = 'TOTAL';
    egresos.getCell('B30').value = { formula: 'SUM(B9:B29)', result: 28000 };

    wb.addWorksheet('Notas').getCell('A1').value = 'Ojo con el acceso';

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('lee los renglones de Ingresos y Egresos con su tipo', async () => {
    const rows = await service.rowsFromWorkbook(await buildCorrida());
    expect(rows).toEqual([
      { concept: 'Taquilla', type: 'income', amount: 100000 },
      { concept: 'Patrocinios', type: 'income', amount: 50000 },
      { concept: 'Audio', type: 'expense', amount: 20000 },
      { concept: 'Hospitality', type: 'expense', amount: 8000 },
    ]);
  });

  it('NO cuenta la fila TOTAL como un renglón más', async () => {
    const rows = await service.rowsFromWorkbook(await buildCorrida());
    expect(rows.map((r) => r.concept)).not.toContain('TOTAL');
    // 150000 + 50000 sería el doble conteo clásico si el TOTAL entrara.
    const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0);
    expect(income).toBe(150000);
  });

  it('ignora el bloque de metadatos que va antes del encabezado', async () => {
    const rows = await service.rowsFromWorkbook(await buildCorrida());
    expect(rows.map((r) => r.concept)).not.toContain('Evento');
  });

  it('ignora las hojas que no son de datos', async () => {
    const rows = await service.rowsFromWorkbook(await buildCorrida());
    expect(rows.map((r) => r.concept)).not.toContain('CORRIDA FINANCIERA — RESUMEN');
    expect(rows.map((r) => r.concept)).not.toContain('Ojo con el acceso');
  });

  it('toma el resultado de una celda con fórmula', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ingresos');
    ws.getCell('A8').value = 'CONCEPTO';
    ws.getCell('A9').value = 'Taquilla con comisión';
    ws.getCell('B9').value = { formula: 'B1*0.9', result: 90000 };
    const rows = await service.rowsFromWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(rows).toEqual([{ concept: 'Taquilla con comisión', type: 'income', amount: 90000 }]);
  });

  it('un libro sin hojas reconocibles devuelve lista vacía, no revienta', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Hoja1').getCell('A1').value = 'cualquier cosa';
    const rows = await service.rowsFromWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(rows).toEqual([]);
  });

  it('descarta renglones sin monto', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Egresos');
    ws.getCell('A8').value = 'CONCEPTO';
    ws.getCell('A9').value = 'Pendiente de cotizar';
    ws.getCell('A10').value = 'Audio';
    ws.getCell('B10').value = 5000;
    const rows = await service.rowsFromWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(rows).toEqual([{ concept: 'Audio', type: 'expense', amount: 5000 }]);
  });
});
