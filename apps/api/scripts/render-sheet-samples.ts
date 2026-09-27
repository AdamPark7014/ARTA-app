/**
 * Imprime en PDF los libros base del cliente (`assets/format-sources`) con el
 * exportador real, para revisar el diseño a ojo sin base de datos.
 *
 *   $env:OUT_DIR='C:\tmp\hojas'; npx ts-node --transpile-only scripts/render-sheet-samples.ts [ruta.xlsx ...]
 */
import * as ExcelJS from 'exceljs';
import { mkdirSync } from 'fs';
import { basename, join } from 'path';
import { ExcelPdfService } from '../src/uploads/excel-pdf.service';
import { buildSheetModel } from '../src/uploads/sheet-layout';

const OUT = process.env.OUT_DIR || join(process.cwd(), 'tmp', 'hojas');
const DEFAULTS = ['DISTRIBUCION_PENDONES.xlsx', 'CORRIDA_BASE.xlsx', 'CAMPANA_BASE.xlsx', 'ORDEN_DE_COMPRA.xlsx'].map((n) =>
  join(process.cwd(), 'assets', 'format-sources', n),
);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS;
  const svc = new ExcelPdfService();
  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const models = wb.worksheets.map((ws) => buildSheetModel(ws, wb));
    const out = join(OUT, `${basename(file).replace(/\.xlsx?$/i, '')}.pdf`);
    await svc.render(out, models, {
      entity: 'ARTA',
      eventName: 'DANIEL BOAVENTURA SINFÓNICO',
      fileName: basename(file).replace(/\.xlsx?$/i, '').replace(/_/g, ' '),
      version: 1,
      generatedBy: 'Adam Pozo',
      generatedAt: new Date(),
    });
    console.log(`${basename(file)} → ${out} (${models.map((m) => `${m.name}: ${m.cells.length} celdas, ${m.images.length} img, ${Math.round(m.totalWidth)}pt`).join(' | ')})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
