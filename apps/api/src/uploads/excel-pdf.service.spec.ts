import * as ExcelJS from 'exceljs';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ExcelPdfService } from './excel-pdf.service';
import { buildSheetModel } from './sheet-layout';

const SOURCES = join(__dirname, '..', '..', 'assets', 'format-sources');

/** Cuenta páginas en el PDF sin librerías extra. */
function pageCount(path: string): number {
  return (readFileSync(path, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
}

describe('ExcelPdfService.render', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'arta-excel-pdf-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const meta = { entity: 'ARTA', eventName: 'ANDRES PARRA', fileName: 'Distribución de Pendones', version: 1, generatedBy: 'Arturo Taja', generatedAt: new Date() };

  it.each(['DISTRIBUCION_PENDONES.xlsx', 'CORRIDA_BASE.xlsx', 'CAMPANA_BASE.xlsx'])(
    'imprime %s sin hoja en blanco al inicio',
    async (name) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(join(SOURCES, name));
      const models = wb.worksheets.map((ws) => buildSheetModel(ws, wb));
      const out = join(dir, `${name}.pdf`);
      await new ExcelPdfService().render(out, models, { ...meta, fileName: name });
      expect(statSync(out).size).toBeGreaterThan(3000);
      const pages = pageCount(out);
      expect(pages).toBeGreaterThanOrEqual(1);
      // Pendones cabe en una carta; la corrida en una o dos; la campaña en pocas.
      expect(pages).toBeLessThanOrEqual(name.startsWith('DISTRIB') ? 1 : 4);
    },
  );

  it('un libro sin hojas con contenido produce una página con aviso', async () => {
    const out = join(dir, 'vacio.pdf');
    await new ExcelPdfService().render(out, [], meta);
    expect(pageCount(out)).toBe(1);
  });
});
