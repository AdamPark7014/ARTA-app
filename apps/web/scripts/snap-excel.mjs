/* eslint-disable no-console */
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import fs from 'node:fs';

function workbookCampana() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Concepto', 'Cantidad', 'Costo', 'Total'],
    ['Audio', 2, 6000, null],
    ['Luces', 1, 8000, null],
  ]);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  ws['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  ws['D2'] = { t: 'n', f: 'B2*C2' };
  ws['D3'] = { t: 'n', f: 'B3*C3' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Campaña');
  return wb;
}

function workbookCorrida() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Concepto', 'Tipo', 'Monto'],
    ['Boletos', 'ingreso', 120000],
    ['Audio', 'egreso', 30000],
    ['Luces', 'egreso', 20000],
  ]);
  ws['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Corrida');
  return wb;
}

async function snapHtml(html, path) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; padding: 10px; background: #0c0c0e; }
      .panel-body { padding: 12px; border-radius: 8px; background: #fff; }
      table { border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 4px 6px; font: 13px "Segoe UI", Arial, sans-serif; }
    </style><div class="panel-body">${html}</div>`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await browser.close();
}

async function main() {
  const camp = workbookCampana();
  const corr = workbookCorrida();
  const campHtml = XLSX.utils.sheet_to_html(camp.Sheets[camp.SheetNames[0]], { id: 'camp', editable: false });
  const corrHtml = XLSX.utils.sheet_to_html(corr.Sheets[corr.SheetNames[0]], { id: 'corr', editable: false });
  // Versión simple (antes): tabla plana sin formato
  function simpleTable(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    const trs = rows
      .map((row) => `<tr>${row.map((c) => `<td>${String(c ?? '')}</td>`).join('')}</tr>`)
      .join('');
    return `<table><tbody>${trs}</tbody></table>`;
  }
  const campSimple = simpleTable(camp.Sheets[camp.SheetNames[0]]);
  const corrSimple = simpleTable(corr.Sheets[corr.SheetNames[0]]);
  fs.writeFileSync('/opt/cursor/artifacts/campana.html', campHtml);
  fs.writeFileSync('/opt/cursor/artifacts/corrida.html', corrHtml);
  await snapHtml(campSimple, '/opt/cursor/artifacts/campana-antes.png');
  await snapHtml(campHtml, '/opt/cursor/artifacts/campana-despues.png');
  await snapHtml(corrSimple, '/opt/cursor/artifacts/corrida-antes.png');
  await snapHtml(corrHtml, '/opt/cursor/artifacts/corrida-despues.png');
  console.log('ARTIFACTS', [
    '/opt/cursor/artifacts/campana.html',
    '/opt/cursor/artifacts/corrida.html',
    '/opt/cursor/artifacts/campana-antes.png',
    '/opt/cursor/artifacts/campana-despues.png',
    '/opt/cursor/artifacts/corrida-antes.png',
    '/opt/cursor/artifacts/corrida-despues.png',
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

