import * as ExcelJS from 'exceljs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cellText, longDateEs, orderFingerprint, orderRows, PurchaseOrderExcelService } from './po-excel.service';

/**
 * Machote parecido al real de Arta: cabecera en un cuadro de texto (que exceljs
 * no conserva), bloque combinado vacío en la fila 13, tabla CANTIDAD/DESCRIPCIÓN/
 * SUBTOTAL con TOTAL = SUM(K20:K28), casillas de forma de pago y datos de ejemplo
 * de otra OC que deben desaparecer.
 */
async function machote(dir: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.pageSetup.fitToPage = true;
  ws.mergeCells('F4:J4');
  ws.getCell('F4').value = 'ORDEN DE COMPRA';
  ws.getCell('J10').value = 'PROVEEDOR';
  ws.getCell('K10').value = 'X';
  ws.getCell('K10').font = { size: 36 };
  ws.getCell('J11').value = 'OTRO';
  ws.mergeCells('D13:H13'); // combinado y vacío: aquí reventaba cell.text
  ws.getCell('B19').value = 'CANTIDAD';
  ws.mergeCells('C19:J19');
  ws.getCell('C19').value = 'DESCRIPCION DEL PRODUCTO';
  ws.getCell('K19').value = 'SUBTOTAL ';
  ws.getCell('B20').value = 1;
  ws.getCell('C20').value = 'ANTICIPO TRANSPORTE';
  ws.getCell('K20').value = 50000;
  ws.getCell('A22').value = 2;
  ws.getCell('J30').value = 'SUBTOTAL ';
  ws.getCell('B31').value = 'EFECTIVO ';
  ws.getCell('C31').value = 'X';
  ws.getCell('J31').value = 'IVA';
  ws.getCell('B32').value = 'TRANSFERENCIA ';
  ws.getCell('J32').value = 'TOTAL ';
  ws.getCell('K32').value = { formula: 'SUM(K20:K28)', result: 50000 } as ExcelJS.CellFormulaValue;
  ws.getCell('K32').numFmt = '"$"#,##0;[Red]-"$"#,##0';
  ws.getCell('B33').value = 'CHEQUE';
  ws.mergeCells('G38:H40');
  ws.getCell('G38').value = 'FECHA DE PAGO ';
  ws.mergeCells('I38:K40');
  ws.getCell('I38').value = 'NOMBRE Y FIRMA DE AUTORIZADO';
  ws.mergeCells('G41:H48');
  ws.mergeCells('I41:K48');
  const extra = wb.addWorksheet('ORDEN DE COMPRA');
  extra.getCell('A1').value = 'OC VIEJA DE EJEMPLO';
  const p = join(dir, 'format-oc.xlsx');
  await wb.xlsx.writeFile(p);
  return p;
}

const order = {
  id: 'po1',
  eventId: 'e1',
  rubro: 'audio',
  vendorName: 'Audio Pro Puebla',
  description: 'Renta de audio',
  paymentMethod: 'TRANSFERENCIA',
  payeeType: 'PROVEEDOR',
  withIva: true,
  amount: 13920,
  createdAt: new Date('2026-11-05T18:00:00Z'),
  createdBy: { fullName: 'Ana Ramírez' },
  authorizedBy: { fullName: 'José Luis Arista' },
  authorizedAt: new Date('2026-11-06T17:00:00Z'),
  paidAt: new Date('2026-11-07T17:00:00Z'),
  lines: [
    { concept: 'Bocinas line array', qty: 2, unitPrice: 4000, total: 8000 },
    { concept: 'Consola digital', qty: 1, unitPrice: 4000, total: 4000 },
  ],
};
const event = { name: 'Mijares Sinfónico', entity: 'ARTA' };

describe('PurchaseOrderExcelService', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'arta-oc-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('cellText no revienta en una celda combinada vacía', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('x');
    ws.mergeCells('D13:H13');
    expect(() => ws.getCell('E13').text).toThrow();
    expect(cellText(ws.getCell('E13'))).toBe('');
    ws.getCell('A1').value = { formula: 'SUM(B1:B2)', result: 7 } as ExcelJS.CellFormulaValue;
    expect(cellText(ws.getCell('A1'))).toBe('7');
    ws.getCell('A2').value = { richText: [{ text: 'Hola ' }, { text: 'mundo' }] } as ExcelJS.CellRichTextValue;
    expect(cellText(ws.getCell('A2'))).toBe('Hola mundo');
  });

  it('la fecha larga va en hora de Puebla', () => {
    // 05-11 a las 02:00 UTC todavía es 4 de noviembre en Puebla.
    expect(longDateEs(new Date('2026-11-05T02:00:00Z'))).toBe('4 DE NOVIEMBRE DEL 2026');
    expect(longDateEs(null)).toBe('');
  });

  it('orderRows cuadra el total autorizado: el IVA es la diferencia exacta', () => {
    const r = orderRows(order);
    expect(r.rows).toHaveLength(2);
    expect(r.subtotal).toBe(12000);
    expect(r.iva).toBe(1920);
    expect(r.total).toBe(13920);
    // Sin partidas: una sola línea con la descripción y el monto.
    const solo = orderRows({ ...order, lines: [], withIva: false, amount: 1200 });
    expect(solo.rows).toEqual([{ qty: 1, concept: 'Renta de audio', unitPrice: 1200, total: 1200 }]);
    expect(solo.total).toBe(1200);
  });

  it('llena el machote real: cabecera, X, partidas, totales, firma; sin datos de ejemplo ni hoja vieja', async () => {
    const tpl = await machote(dir);
    const svc = new PurchaseOrderExcelService();
    const out = join(dir, 'out.xlsx');
    await svc.buildFromTemplate(tpl, order, event, out);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(out);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Hoja1']);
    const ws = wb.worksheets[0];
    const text = (a: string) => cellText(ws.getCell(a));

    expect(text('B10')).toBe('FECHA DE SOLICITUD: 5 DE NOVIEMBRE DEL 2026');
    expect(text('B11')).toBe('SOLICITANTE: ANA RAMÍREZ');
    expect(text('B12')).toBe('EVENTO: MIJARES SINFÓNICO');
    expect(text('B13')).toBe('NOMBRE DE PROVEEDOR: AUDIO PRO PUEBLA');
    expect(text('K10')).toBe('X');
    expect(text('K11')).toBe('');

    expect(text('B20')).toBe('2');
    expect(text('C20')).toContain('Bocinas line array');
    expect(ws.getCell('K20').value).toBe(8000);
    expect(text('C21')).toBe('Consola digital');
    expect(ws.getCell('K21').value).toBe(4000);
    expect(text('C22')).toBe(''); // ya no está «ANTICIPO TRANSPORTE» ni el 2 de la columna A
    expect(text('A22')).toBe('');

    expect(text('K30')).toBe('12000');
    expect((ws.getCell('K30').value as ExcelJS.CellFormulaValue).formula).toBe('SUM(K20:K28)');
    expect(ws.getCell('K31').value).toBe(1920);
    expect(text('K32')).toBe('13920');

    expect(text('C31')).toBe(''); // EFECTIVO ya no trae la X del ejemplo
    expect(text('C32')).toBe('X'); // TRANSFERENCIA
    expect(text('G41')).toBe('7 DE NOVIEMBRE DEL 2026');
    expect(text('I41')).toBe('JOSÉ LUIS ARISTA\nAUTORIZÓ EL 06/11/2026');
  });

  it('OTRO + ADENDUM: la X va en OTRO y la forma de pago se explica en la cabecera', async () => {
    const tpl = await machote(dir);
    const svc = new PurchaseOrderExcelService();
    const out = join(dir, 'out2.xlsx');
    await svc.buildFromTemplate(
      tpl,
      {
        ...order,
        payeeType: 'OTRO',
        paymentMethod: 'ADENDUM',
        adendumPerson: 'María López',
        adendumAccount: '0123 4567',
        withIva: false,
        amount: 1200,
        lines: [],
        authorizedBy: null,
        paidAt: null,
      },
      event,
      out,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(out);
    const ws = wb.worksheets[0];
    const text = (a: string) => cellText(ws.getCell(a));
    expect(text('K10')).toBe('');
    expect(text('K11')).toBe('X');
    expect(text('B14')).toBe('FORMA DE PAGO: ADENDUM · A NOMBRE DE MARÍA LÓPEZ · CUENTA 0123 4567');
    expect(text('C31')).toBe('');
    expect(text('C32')).toBe('');
    expect(text('C33')).toBe('');
    expect(text('G41')).toBe('');
    expect(text('I41')).toBe('');
    expect(ws.getCell('K31').value).toBe(0);
    expect(text('K32')).toBe('1200');
  });

  it('con más partidas que renglones, resume el resto en la última fila sin perder dinero', async () => {
    const tpl = await machote(dir);
    const svc = new PurchaseOrderExcelService();
    const out = join(dir, 'out3.xlsx');
    const lines = Array.from({ length: 11 }, (_, i) => ({ concept: `Partida ${i + 1}`, qty: 1, unitPrice: 100, total: 100 }));
    await svc.buildFromTemplate(tpl, { ...order, withIva: false, amount: 1100, lines }, event, out);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(out);
    const ws = wb.worksheets[0];
    expect(cellText(ws.getCell('C27'))).toBe('Partida 8');
    expect(cellText(ws.getCell('C28'))).toBe('… Y 3 PARTIDAS MÁS (DETALLE EN ARTA)');
    expect(ws.getCell('K28').value).toBe(300);
    expect(cellText(ws.getCell('C29'))).toBe('');
    expect(cellText(ws.getCell('K30'))).toBe('1100');
  });

  it('sin IVA, un centavo de redondeo se absorbe en la última partida: la hoja suma lo autorizado', () => {
    const r = orderRows({
      ...order,
      withIva: false,
      amount: 1,
      lines: [
        { concept: 'a', qty: 1, unitPrice: 0.333, total: 0.33 },
        { concept: 'b', qty: 1, unitPrice: 0.333, total: 0.33 },
        { concept: 'c', qty: 1, unitPrice: 0.333, total: 0.33 },
      ],
    });
    expect(r.rows.map((x) => x.total)).toEqual([0.33, 0.33, 0.34]);
    expect(r.subtotal).toBe(1);
    expect(r.total).toBe(1);
    expect(r.iva).toBe(0);
  });

  it('la huella depende de los datos, no de la hora: exportar sin cambios no sube la versión', () => {
    const a = orderFingerprint(order, event);
    const b = orderFingerprint({ ...order, lines: order.lines!.map((l) => ({ ...l })) }, event);
    expect(a).toBe(b);
    expect(orderFingerprint({ ...order, amount: 13921 }, event)).not.toBe(a);
    expect(orderFingerprint({ ...order, paidAt: null }, event)).not.toBe(a);
  });

  it('respeta un SUM con anclas ($K$20:$K$28) y exactamente 9 partidas no necesitan fila resumen', async () => {
    const tpl = await machote(dir);
    const wb0 = new ExcelJS.Workbook();
    await wb0.xlsx.readFile(tpl);
    wb0.worksheets[0].getCell('K32').value = { formula: 'SUM($K$20:$K$28)', result: 0 } as ExcelJS.CellFormulaValue;
    const tpl2 = join(dir, 'format-anclas.xlsx');
    await wb0.xlsx.writeFile(tpl2);
    const svc = new PurchaseOrderExcelService();
    const out = join(dir, 'out-anclas.xlsx');
    const lines = Array.from({ length: 9 }, (_, i) => ({ concept: `Partida ${i + 1}`, qty: 1, unitPrice: 100, total: 100 }));
    await svc.buildFromTemplate(tpl2, { ...order, withIva: false, amount: 900, lines }, event, out);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(out);
    const ws = wb.worksheets[0];
    expect(cellText(ws.getCell('C28'))).toBe('Partida 9');
    expect(cellText(ws.getCell('C29'))).toBe('');
    expect((ws.getCell('K30').value as ExcelJS.CellFormulaValue).formula).toBe('SUM(K20:K28)');
    expect(cellText(ws.getCell('K32'))).toBe('900');
  });

  it('si al machote le faltan las etiquetas que lo anclan, arma la OC limpia en vez de una hoja a medias', async () => {
    const wb0 = new ExcelJS.Workbook();
    const ws0 = wb0.addWorksheet('Hoja1');
    ws0.getCell('F4').value = 'ORDEN DE COMPRA';
    ws0.getCell('B19').value = 'CANTIDAD'; // sin PROVEEDOR ni TOTAL
    const tpl = join(dir, 'format-raro.xlsx');
    await wb0.xlsx.writeFile(tpl);
    const svc = new PurchaseOrderExcelService();
    const out = join(dir, 'out-raro.xlsx');
    await svc.buildFromTemplate(tpl, order, event, out);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(out);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['ORDEN DE COMPRA']);
    const ws = wb.worksheets[0];
    expect(cellText(ws.getCell('A1'))).toBe('ORDEN DE COMPRA');
    expect(cellText(ws.getCell('A3'))).toBe('FECHA DE SOLICITUD: 5 DE NOVIEMBRE DEL 2026');
    // Los totales sí están, cuadrados con lo autorizado.
    const texts: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => texts.push(cellText(c))));
    expect(texts).toEqual(expect.arrayContaining(['SUBTOTAL', 'IVA', 'TOTAL', '13920']));
  });

  it('sin machote en disco arma una OC limpia en vez de fallar', async () => {
    const svc = new PurchaseOrderExcelService();
    const out = join(dir, 'plain.xlsx');
    await svc.buildFromTemplate(join(dir, 'no-existe.xlsx'), order, event, out);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(out);
    const ws = wb.worksheets[0];
    expect(cellText(ws.getCell('A1'))).toBe('ORDEN DE COMPRA');
    expect(cellText(ws.getCell('A3'))).toBe('FECHA DE SOLICITUD: 5 DE NOVIEMBRE DEL 2026');
  });
});
