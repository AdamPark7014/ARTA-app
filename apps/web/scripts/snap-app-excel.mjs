/* eslint-disable no-console */
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';

function campWorkbook() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['GASTOS DE PUBLICIDAD Y CONVENIOS', '', '', ''],
    ['Concepto', 'Cantidad', 'Costo unitario', 'Total'],
    ['Audio', 2, 6000, null],
    ['Luces', 1, 8000, null],
  ]);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  ws['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
  ws['D3'] = { t: 'n', f: 'B3*C3' };
  ws['D4'] = { t: 'n', f: 'B4*C4' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Campaña');
  return Buffer.from(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
}

function corridaWorkbook() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Concepto', 'Tipo', 'Monto'],
    ['Boletos', 'income', 120000],
    ['Audio', 'expense', 30000],
    ['Luces', 'expense', 20000],
  ]);
  ws['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Corrida');
  return Buffer.from(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
}

function pendonesWorkbook() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['DISTRIBUCIÓN PENDONES CHOLULA', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['COLOCACIÓN PENDONES', '', '', '', '', ''],
    ['EVENTO', 'AVENIDAS PRINCIPALES', 'PRIMERA PARTE', 'SEGUNDA PARTE', 'TERCERA PARTE', ''],
    ['', 'FEDERAL ATLIXCO', 10, 10, 10, ''],
    ['', 'CAMINO REAL', 8, 6, 5, ''],
    ['', 'BLVD NIÑO POBLANO', 12, 10, 10, ''],
  ]);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 2, c: 4 } }];
  ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 6 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pendones');
  return Buffer.from(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
}

function ocWorkbook() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['', '', '', '', '', 'ORDEN DE COMPRA'],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', 'CANTIDAD', 'DESCRIPCION DEL PRODUCTO', '', '', 'SUBTOTAL'],
    [1, '', 'ANTICIPO TRANSPORTE', '', '', 50000],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', 'SUBTOTAL'],
    ['', '', '', '', '', 'TOTAL'],
  ]);
  ws['!merges'] = [{ s: { r: 3, c: 2 }, e: { r: 3, c: 5 } }];
  ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ORDEN DE COMPRA');
  return Buffer.from(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/api/files/camp/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: campWorkbook(),
    }),
  );
  await page.goto('http://127.0.0.1:3100/dev/sheet-snap?title=Campaña&fileId=camp&fileName=Campaña.xlsx&viewer=1', {
    waitUntil: 'load',
  });
  await page.screenshot({ path: '/opt/cursor/artifacts/campana-app.png' });

  // Corrida
  await page.route('**/api/files/corr/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: corridaWorkbook(),
    }),
  );
  await page.goto('http://127.0.0.1:3100/dev/sheet-snap?title=Corrida&fileId=corr&fileName=Corrida.xlsx&viewer=1', {
    waitUntil: 'load',
  });
  await page.screenshot({ path: '/opt/cursor/artifacts/corrida-app.png' });

  // Pendones
  await page.route('**/api/files/pend/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: pendonesWorkbook(),
    }),
  );
  await page.goto(
    'http://127.0.0.1:3100/dev/sheet-snap?title=Pendones&fileId=pend&fileName=DISTRIBUCION_PENDONES.xlsx&viewer=1',
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: '/opt/cursor/artifacts/pendones-app.png' });

  // Orden de compra
  await page.route('**/api/files/oc/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: ocWorkbook(),
    }),
  );
  await page.goto('http://127.0.0.1:3100/dev/sheet-snap?title=OC&fileId=oc&fileName=ORDEN_DE_COMPRA.xlsx&viewer=1', {
    waitUntil: 'load',
  });
  await page.screenshot({ path: '/opt/cursor/artifacts/oc-app.png' });

  // Visor del mismo archivo (campaña)
  await page.goto('http://127.0.0.1:3100/dev/sheet-snap?title=Visor&fileId=camp&fileName=Campaña.xlsx&viewer=1', {
    waitUntil: 'load',
  });
  await page.screenshot({ path: '/opt/cursor/artifacts/visor.png' });
  await browser.close();
  console.log('ARTIFACTS', [
    '/opt/cursor/artifacts/campana-app.png',
    '/opt/cursor/artifacts/corrida-app.png',
    '/opt/cursor/artifacts/pendones-app.png',
    '/opt/cursor/artifacts/oc-app.png',
    '/opt/cursor/artifacts/visor.png',
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

