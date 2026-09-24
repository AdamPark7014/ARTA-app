/**
 * Registra los archivos originales de formatos (Excel) como plantillas estándar.
 *
 * Uso:
 *   ts-node --transpile-only apps/api/scripts/register-format-sources.ts [--dry] [--confirm-produccion]
 *
 * Efectos:
 * - Copia los .xlsx al UPLOAD_DIR con nombres estables:
 *   /uploads/format-pendones.xlsx, /uploads/format-oc.xlsx, /uploads/format-oc-variant.xlsx
 * - Crea/actualiza plantilla «Distribución de Pendones (Excel)» con excelTemplateUrl.
 * - No toca la plantilla de Pendones de formulario; coexisten.
 * - Para OC: solo registra y deja audit; la generación desde plantilla se integra aparte.
 */
import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { uploadRoot } from '../src/uploads/upload-storage';
import * as ExcelJS from 'exceljs';

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const prisma = new PrismaClient();
  const DRY = has('dry');
  const CONFIRM = has('confirm-produccion');

  mkdirSync(uploadRoot, { recursive: true });

  const assetsDir = join(process.cwd(), 'apps', 'api', 'assets', 'format-sources');
  const sources = [
    { name: 'DISTRIBUCION_PENDONES.xlsx', out: 'format-pendones.xlsx' },
    { name: 'ORDEN_DE_COMPRA.xlsx', out: 'format-oc.xlsx' },
    { name: 'ORDEN_DE_COMPRA_VARIANTE.xlsx', out: 'format-oc-variant.xlsx' },
    { name: 'CAMPANA_BASE.xlsx', out: 'format-campaign.xlsx' },
    { name: 'CORRIDA_BASE.xlsx', out: 'format-corrida.xlsx' },
  ].filter((x) => existsSync(join(assetsDir, x.name)));

  if (!sources.length) {
    console.log('Nada que copiar — coloca los archivos en apps/api/assets/format-sources');
  } else {
    for (const { name, out } of sources) {
      const src = join(assetsDir, name);
      const dest = join(uploadRoot, out);
      console.log(`${DRY ? '· DRY ' : ''}Copiar ${src} → ${dest}`);
      if (!DRY) copyFileSync(src, dest);
    }
  }

  // Fallbacks generados cuando falten los assets — sirven para pruebas y CI.
  async function ensureCampaignTemplate() {
    const dest = join(uploadRoot, 'format-campaign.xlsx');
    if (existsSync(dest)) return;
    if (CONFIRM) {
      console.error('Falta CAMPANA_BASE.xlsx en assets — abortando (no se permiten fallbacks con --confirm-produccion)');
      process.exit(1);
    }
    console.log(`${DRY ? '· DRY ' : ''}Generar plantilla estándar de Campaña → ${dest}`);
    if (DRY) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Campaña');
    // Título y bloque meta (filas 1–4)
    ws.mergeCells('A1:I1');
    ws.getCell('A1').value = 'GASTOS DE PUBLICIDAD Y CONVENIOS';
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.addRow([]);
    ws.addRow(['PROMOTOR', '', 'EVENTO', '', '', '', '', '', '']);
    ws.addRow(['FECHA', '', 'VENUE', '', '', '', '', '', '']);
    ws.addRow(['HORARIO', '', 'CIUDAD', '', '', '', '', '', '']);
    ws.addRow([]);
    // Encabezado (fila 6)
    const header = [
      'CONCEPTO',
      'CANTIDAD',
      'COSTO',
      'COSTO TOTAL',
      'CANTIDAD ARTA',
      'COSTO ARTA',
      'COSTO TOTAL ARTA',
      'PAGADO',
      'POR PAGAR',
    ];
    ws.addRow(header);
    ws.getRow(6).font = { bold: true };
    ws.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    // 12 filas de ejemplo con fórmulas D=B*C y G=E*F
    for (let i = 0; i < 12; i += 1) {
      const r = ws.addRow(['', null, null, null, null, null, null, null, null]);
      const excelRow = r.number;
      ws.getCell(`D${excelRow}`).value = { formula: `B${excelRow}*C${excelRow}` };
      ws.getCell(`G${excelRow}`).value = { formula: `E${excelRow}*F${excelRow}` };
    }
    // Totales al final
    ws.addRow([]);
    const totalRow = ws.addRow(['TOTAL', '', '', null, '', '', null, '', '']);
    const firstData = 7;
    const lastData = totalRow.number - 1;
    ws.getCell(`D${totalRow.number}`).value = { formula: `SUM(D${firstData}:D${lastData})` };
    ws.getCell(`G${totalRow.number}`).value = { formula: `SUM(G${firstData}:G${lastData})` };
    // Anchos de columna aproximados
    ws.columns = [
      { width: 42 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 18 },
      { width: 14 },
      { width: 14 },
    ];
    await wb.xlsx.writeFile(dest);
  }

  async function ensureCorridaTemplate() {
    const dest = join(uploadRoot, 'format-corrida.xlsx');
    if (existsSync(dest)) return;
    if (CONFIRM) {
      console.error('Falta CORRIDA_BASE.xlsx en assets — abortando (no se permiten fallbacks con --confirm-produccion)');
      process.exit(1);
    }
    console.log(`${DRY ? '· DRY ' : ''}Generar plantilla estándar de Corrida → ${dest}`);
    if (DRY) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Corrida');
    // Título y meta mínima
    ws.mergeCells('A1:L1');
    ws.getCell('A1').value = 'CORRIDA FINANCIERA';
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.addRow([]);
    ws.addRow(['EVENTO', '']);
    ws.addRow(['FUNCIONES', 1]);
    ws.addRow([]);
    // Escenarios: AFORO | PRECIO | 1 | 0.9 | … | 0.2
    ws.addRow(['AFORO', 'PRECIO', '1.0', '0.9', '0.8', '0.7', '0.6', '0.5', '0.4', '0.3', '0.2']);
    ws.getRow(6).font = { bold: true };
    // Tiers de ingresos (8 filas)
    const tierStart = 7;
    for (let i = 0; i < 8; i += 1) {
      ws.addRow([0, 0, null, null, null, null, null, null, null, null, null]);
      const r = tierStart + i;
      // Ingreso base D = B*C*funciones; escalado por cada escenario (col 3..11)
      ws.getCell(`C${r}`).value = { formula: `B${r}*A${r}*$B$4` }; // 1.0
      ws.getCell(`D${r}`).value = { formula: `C${r}*0.9` };
      ws.getCell(`E${r}`).value = { formula: `C${r}*0.8` };
      ws.getCell(`F${r}`).value = { formula: `C${r}*0.7` };
      ws.getCell(`G${r}`).value = { formula: `C${r}*0.6` };
      ws.getCell(`H${r}`).value = { formula: `C${r}*0.5` };
      ws.getCell(`I${r}`).value = { formula: `C${r}*0.4` };
      ws.getCell(`J${r}`).value = { formula: `C${r}*0.3` };
      ws.getCell(`K${r}`).value = { formula: `C${r}*0.2` };
    }
    // Totales de ingresos por escenario
    ws.addRow([]);
    const totalIncomeRow = ws.addRow(['TOTAL INGRESOS', '', { formula: `SUM(C${tierStart}:C${tierStart + 7})` }]);
    const colLetter = (n: number) => {
      let s = '';
      while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    };
    for (let c = 4; c <= 11; c += 1) {
      const sumCol = colLetter(c);
      const cell = ws.getRow(totalIncomeRow.number).getCell(c);
      cell.value = { formula: `SUM(${sumCol}${tierStart}:${sumCol}${tierStart + 7})` };
    }
    ws.columns = [{ width: 12 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
    await wb.xlsx.writeFile(dest);
  }

  // Asegurar plantillas si faltan
  await ensureCampaignTemplate();
  await ensureCorridaTemplate();

  if (sources.some((s) => s.out === 'format-pendones.xlsx')) {
    const url = '/uploads/format-pendones.xlsx';
    console.log(`${DRY ? '· DRY ' : ''}Upsert plantilla «Distribución de Pendones (Excel)»`);
    if (!DRY) {
      const existing = await prisma.checklistTemplate.findFirst({
        where: { name: { contains: 'Distribución de Pendones (Excel)' } },
      });
      if (existing) {
        await prisma.checklistTemplate.update({
          where: { id: existing.id },
          data: { ...( { excelTemplateUrl: url } as any), active: true },
        });
      } else {
        await prisma.checklistTemplate.create({
          data: {
            key: 'CUSTOM',
            name: 'Distribución de Pendones (Excel)',
            description: 'Hoja base con layout/merges iguales al formato del cliente',
            entities: [],
            schemaJson: { sections: [] } as unknown as Prisma.InputJsonValue,
            active: true,
            ...( { excelTemplateUrl: url } as any),
          } as any,
        });
      }
    }
  }

  if (sources.some((s) => s.out.startsWith('format-oc')) && !CONFIRM) {
    console.log('· OC: registrados los archivos en /uploads. Integración PDF/xlsx por plantilla en pasos siguientes.');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

