import { expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { PNG } from 'pngjs';

async function waitApiReady(base = 'http://127.0.0.1:4000') {
  const maxMs = 120_000;
  const start = Date.now();
  // Poll /ready until 200 or timeout
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${base}/ready`);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('API /ready not reachable in time');
}

async function analyzePng(filePath: string): Promise<{ sizeBytes: number; colors: number }> {
  const buf = fs.readFileSync(filePath);
  const sizeBytes = buf.length;
  const png = PNG.sync.read(buf);
  const set = new Set<string>();
  const { data, width, height } = png;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      const r = data[idx + 0];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      set.add(`${r},${g},${b},${a}`);
    }
  }
  return { sizeBytes, colors: set.size };
}

function expectPngQuality(filePath: string) {
  const info = analyzePng(filePath);
  return info.then(({ sizeBytes, colors }) => {
    console.log(`PNG ${path.basename(filePath)} — ${Math.round(sizeBytes / 1024)} KB · ${colors} colors`);
    expect(sizeBytes, `${path.basename(filePath)} is too small`).toBeGreaterThanOrEqual(30 * 1024);
    expect(colors, `${path.basename(filePath)} has too few colors`).toBeGreaterThanOrEqual(50);
  });
}

function fx(selector: string) {
  return selector;
}

const ROOT = path.resolve(process.cwd(), '..'); // apps/
const TPL_DIR = path.resolve(ROOT, 'api/assets/format-sources');

test.describe('Stack real: Excel + Word con archivos reales', () => {
  test.setTimeout(180_000);

  test('Carga real, edición y capturas con verificación de calidad', async ({ page, baseURL }) => {
    // 1) API real lista
    await waitApiReady();

    // 2) Login con usuario seed
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.locator('input[name="email"]').fill('arturo@artaproducciones.com');
    await page.locator('input[name="password"]').fill('ArtaDevLocal-1');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL('**/dashboard');

    // 3) Ir a eventos y abrir uno
    await page.goto('/events');
    const anyEvent = page.locator('.ev-card').first();
    await anyEvent.click();
    await expect(page.getByRole('heading', { name: /Evento/i })).toBeVisible({ timeout: 10_000 });

    // 4) Ir a Documentos
    await page.getByRole('tab', { name: 'Documentos' }).click();
    await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();

    // Helper: subir archivo por etiqueta "Subir archivo"
    async function uploadXlsx(localName: string) {
      const filePath = path.join(TPL_DIR, localName);
      expect(fs.existsSync(filePath), `Missing template ${localName}`).toBeTruthy();
      const input = page.locator('label:has-text("Subir archivo") input[type="file"]');
      await input.setInputFiles(filePath);
      await expect(page.locator('.hub-list .hub-item', { hasText: localName })).toBeVisible();
      return filePath;
    }

    // Helper: importar Word
    async function importDocx(localName: string) {
      const filePath = path.join(TPL_DIR, localName);
      expect(fs.existsSync(filePath), `Missing template ${localName}`).toBeTruthy();
      const input = page.locator('label:has-text("Importar Word") input[type="file"]');
      await input.setInputFiles(filePath);
      // DocEditor abre
      await expect(page.locator('.docedit-app')).toBeVisible();
      return filePath;
    }

    // Excel: Campaña
    const campPath = await uploadXlsx('CAMPANA_BASE.xlsx');
    // Texto real esperado (desde el archivo)
    const campWb = XLSX.read(fs.readFileSync(campPath));
    const campFirst = campWb.SheetNames[0];
    const campHtmlNeedle = 'GASTOS';
    const campRows: unknown[][] = XLSX.utils.sheet_to_json(campWb.Sheets[campFirst], { header: 1, defval: '' }) as any;
    expect(campRows.flat().some((cell) => String(cell).toUpperCase().includes(campHtmlNeedle))).toBeTruthy();
    // Abrir visor
    const campRow = page.locator('.hub-item', { hasText: 'CAMPANA_BASE.xlsx' }).first();
    await campRow.getByRole('button', { name: 'Ver' }).click();
    await expect(page.locator('.sheet-editor')).toBeVisible();
    await expect(page.locator('.sheet-state--error')).toHaveCount(0);
    await page.locator('.sheet-editor').first().screenshot({ path: '/opt/cursor/artifacts/campana.png', animations: 'disabled' });

    // Excel: Corrida
    const corrPath = await uploadXlsx('CORRIDA_BASE.xlsx');
    const corrWb = XLSX.read(fs.readFileSync(corrPath));
    const corrFirst = corrWb.SheetNames[0];
    const corrRows: unknown[][] = XLSX.utils.sheet_to_json(corrWb.Sheets[corrFirst], { header: 1, defval: '' }) as any;
    expect(corrRows.flat().some((cell) => String(cell).toUpperCase().includes('CONCEPTO') || String(cell).toUpperCase().includes('INGRES'))).toBeTruthy();
    const corrRow = page.locator('.hub-item', { hasText: 'CORRIDA_BASE.xlsx' }).first();
    await corrRow.getByRole('button', { name: 'Ver' }).click();
    await expect(page.locator('.surface .sheet-editor').nth(1)).toBeVisible();
    await page.locator('.surface .sheet-editor').nth(1).screenshot({ path: '/opt/cursor/artifacts/corrida.png', animations: 'disabled' });

    // Excel: Pendones
    const pendPath = await uploadXlsx('DISTRIBUCION_PENDONES.xlsx');
    const pendWb = XLSX.read(fs.readFileSync(pendPath));
    const pendFirst = pendWb.SheetNames[0];
    const pendRows: unknown[][] = XLSX.utils.sheet_to_json(pendWb.Sheets[pendFirst], { header: 1, defval: '' }) as any;
    expect(pendRows.flat().some((cell) => String(cell).toUpperCase().includes('PENDONES'))).toBeTruthy();
    const pendRow = page.locator('.hub-item', { hasText: 'DISTRIBUCION_PENDONES.xlsx' }).first();
    await pendRow.getByRole('button', { name: 'Ver' }).click();
    await expect(page.locator('.surface .sheet-editor').nth(2)).toBeVisible();
    await page.locator('.surface .sheet-editor').nth(2).screenshot({ path: '/opt/cursor/artifacts/pendones.png', animations: 'disabled' });

    // Excel: Orden de compra
    const ocPath = await uploadXlsx('ORDEN_DE_COMPRA.xlsx');
    const ocWb = XLSX.read(fs.readFileSync(ocPath));
    const ocFirst = ocWb.SheetNames[0];
    const ocRows: unknown[][] = XLSX.utils.sheet_to_json(ocWb.Sheets[ocFirst], { header: 1, defval: '' }) as any;
    expect(ocRows.flat().some((cell) => String(cell).toUpperCase().includes('ORDEN') || String(cell).toUpperCase().includes('COMPRA'))).toBeTruthy();
    const ocRow = page.locator('.hub-item', { hasText: 'ORDEN_DE_COMPRA.xlsx' }).first();
    await ocRow.getByRole('button', { name: 'Ver' }).click();
    await expect(page.locator('.surface .sheet-editor').nth(3)).toBeVisible();
    await page.locator('.surface .sheet-editor').nth(3).screenshot({ path: '/opt/cursor/artifacts/oc.png', animations: 'disabled' });

    // Excel: edición y recálculo (crear una suma simple propia para validar HF)
    await campRow.getByRole('button', { name: /Editar|Editar aquí/ }).click();
    const editor = page.locator('.surface .sheet-editor').first();
    await expect(editor).toBeVisible();
    // Escribir datos en A24 y A25 y fórmula en A26
    await page.getByLabel('Celda A24', { exact: true }).fill('1');
    await page.getByLabel('Celda A25', { exact: true }).fill('2');
    await page.getByLabel('Celda A26', { exact: true }).click();
    await page.getByLabel('Editar A26', { exact: true }).fill('=A24+A25');
    // Seleccionar fórmula para mostrar en barra fx
    await page.getByLabel('Celda A26', { exact: true }).click();
    // Debe valer 3
    await expect(page.getByLabel('Celda A26', { exact: true })).toHaveValue('3');
    await editor.screenshot({ path: '/opt/cursor/artifacts/excel-editando.png', animations: 'disabled' });

    // Visor puro del mismo archivo
    await page.getByRole('button', { name: 'Cerrar' }).first().click();
    await campRow.getByRole('button', { name: 'Ver' }).click();
    const viewer = page.locator('.surface .sheet-editor').first();
    await expect(viewer).toBeVisible();
    await viewer.screenshot({ path: '/opt/cursor/artifacts/visor-excel.png', animations: 'disabled' });

    // Word: importar Checklist Producción
    const prodPath = await importDocx('CHECKLIST_PRODUCCION.docx');
    const prodHtml = (await mammoth.convertToHtml({ buffer: fs.readFileSync(prodPath) })).value || '';
    expect(/PRODUCCI[ÓO]N/i.test(prodHtml)).toBeTruthy();
    await page.locator('.docedit-app').first().screenshot({ path: '/opt/cursor/artifacts/checklist-produccion.png', animations: 'disabled' });

    // Word: importar Creación de boletera
    const bolPath = await importDocx('CREACION_BOLETERA.docx');
    const bolHtml = (await mammoth.convertToHtml({ buffer: fs.readFileSync(bolPath) })).value || '';
    expect(/BOLETERA/i.test(bolHtml)).toBeTruthy();
    await page.locator('.docedit-app').first().screenshot({ path: '/opt/cursor/artifacts/boletera.png', animations: 'disabled' });

    // Word: edición rápida y Tab al siguiente campo
    await page.locator('.docedit__title').fill('Prueba edición Word');
    const firstArea = page.locator('.docedit__text').first();
    await firstArea.fill('Campo 1');
    await firstArea.press('Tab');
    await page.locator('.docedit__text').nth(1).fill('Campo 2');
    await page.locator('.docedit-app').first().screenshot({ path: '/opt/cursor/artifacts/word-editando.png', animations: 'disabled' });

    // 5) Validación de calidad de PNG: >= 30 KB y >= 50 colores
    await expectPngQuality('/opt/cursor/artifacts/campana.png');
    await expectPngQuality('/opt/cursor/artifacts/corrida.png');
    await expectPngQuality('/opt/cursor/artifacts/pendones.png');
    await expectPngQuality('/opt/cursor/artifacts/oc.png');
    await expectPngQuality('/opt/cursor/artifacts/visor-excel.png');
    await expectPngQuality('/opt/cursor/artifacts/excel-editando.png');
    await expectPngQuality('/opt/cursor/artifacts/checklist-produccion.png');
    await expectPngQuality('/opt/cursor/artifacts/boletera.png');
    await expectPngQuality('/opt/cursor/artifacts/word-editando.png');
  });
});

