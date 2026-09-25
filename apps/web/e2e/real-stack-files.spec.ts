import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
const OUT_DIR = path.resolve(process.cwd(), 'e2e-screens');

// WCAG contrast helpers
function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function parseCssColor(s: string): [number, number, number] | null {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
async function expectContrast(page: Page, selector: string, min: number) {
  const { fg, bg } = await page.$eval(selector, (el: Element) => {
    const cs = window.getComputedStyle(el as Element);
    return { fg: cs.color, bg: cs.backgroundColor };
  });
  const fgRgb = parseCssColor(fg);
  const bgRgb = parseCssColor(bg);
  expect(fgRgb && bgRgb).toBeTruthy();
  const l1 = luminance(fgRgb as any) + 0.05;
  const l2 = luminance(bgRgb as any) + 0.05;
  const ratio = l1 > l2 ? l1 / l2 : l2 / l1;
  expect(ratio).toBeGreaterThanOrEqual(min);
}

test.use({ colorScheme: 'dark' });

test.describe('Stack real: Excel + Word con archivos reales', () => {
  test.setTimeout(180_000);

  test('Carga real, edición y capturas con verificación de calidad', async ({ page, baseURL }, testInfo) => {
    // 1) API real lista
    await waitApiReady();

    // 2) Login con usuario seed
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.locator('input[name="email"]').fill('arturo@artaproducciones.com');
    await page.locator('input[name="password"]').fill('ArtaDevLocal-1');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL('**/dashboard');
    // Global: avoid sticky app header covering screenshots
    await page.addStyleTag({
      content:
        `
        .app-header, .site-header, .brand, .sticky, .sticky-top, .brandbar, .shell .header, .topbar { position: static !important; box-shadow: none !important; z-index: 0 !important; }
        .global-banner, .top-toast, .announce, .toaster { display: none !important; }
        `,
    });

    // 3) Crear evento vía API y abrir Documentos
    const createdId = await page.evaluate(async () => {
      const getCookie = (name: string) =>
        document.cookie
          .split(';')
          .map((s) => s.trim())
          .map((s) => s.split('='))
          .reduce<Record<string, string>>((acc, [k, v]) => ((acc[k] = decodeURIComponent(v || '')), acc), {})[name];
      const csrf = getCookie('arta_csrf') || '';
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ entity: 'ARTA', name: `Validación E2E` }),
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data?.id || data?.event?.id || '';
    });
    expect(createdId).toBeTruthy();
    await page.goto(`/events/${createdId}?tab=files`);
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
    await campRow.getByRole('button', { name: /Ver|Ver \/ Editar/ }).click();
    await expect(page.locator('.sheet-editor')).toBeVisible();
    // Evitar que la cabecera sticky tape contenido en las capturas
    await page.addStyleTag({
      content:
        `
        .app-header, .site-header, .brand, .sticky, .sticky-top, .brandbar, .shell .header, .topbar { position: static !important; box-shadow: none !important; z-index: 0 !important; }
        .global-banner, .top-toast, .announce, .toaster { display: none !important; }
        `,
    });
    await expect(page.locator('.sheet-state--error')).toHaveCount(0);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await page.locator('.sheet-editor').first().screenshot({ path: path.join(OUT_DIR, 'campana.png'), animations: 'disabled' });
    await testInfo.attach('campana.png', { path: path.join(OUT_DIR, 'campana.png') });
    // Cerrar visor antes de abrir otro
    await page.getByRole('button', { name: 'Cerrar' }).first().click();

    // Excel: Corrida
    const corrPath = await uploadXlsx('CORRIDA_BASE.xlsx');
    const corrWb = XLSX.read(fs.readFileSync(corrPath));
    const corrFirst = corrWb.SheetNames[0];
    const corrRows: unknown[][] = XLSX.utils.sheet_to_json(corrWb.Sheets[corrFirst], { header: 1, defval: '' }) as any;
    expect(corrRows.flat().some((cell) => String(cell).toUpperCase().includes('CONCEPTO') || String(cell).toUpperCase().includes('INGRES'))).toBeTruthy();
    const corrRow = page.locator('.hub-item', { hasText: 'CORRIDA_BASE.xlsx' }).first();
    await corrRow.getByRole('button', { name: /Ver|Ver \/ Editar/ }).click();
  // Solo hay un editor montado a la vez
  await expect(page.locator('.surface .sheet-editor').first()).toBeVisible();
  await page.locator('.surface .sheet-editor').first().screenshot({ path: path.join(OUT_DIR, 'corrida.png'), animations: 'disabled' });
  await testInfo.attach('corrida.png', { path: path.join(OUT_DIR, 'corrida.png') });
  await page.getByRole('button', { name: 'Cerrar' }).first().click();

    // Excel: Pendones
    const pendPath = await uploadXlsx('DISTRIBUCION_PENDONES.xlsx');
    const pendWb = XLSX.read(fs.readFileSync(pendPath));
    const pendFirst = pendWb.SheetNames[0];
    const pendRows: unknown[][] = XLSX.utils.sheet_to_json(pendWb.Sheets[pendFirst], { header: 1, defval: '' }) as any;
    expect(pendRows.flat().some((cell) => String(cell).toUpperCase().includes('PENDONES'))).toBeTruthy();
    const pendRow = page.locator('.hub-item', { hasText: 'DISTRIBUCION_PENDONES.xlsx' }).first();
    await pendRow.getByRole('button', { name: /Ver|Ver \/ Editar/ }).click();
  await expect(page.locator('.surface .sheet-editor').first()).toBeVisible();
  await page.locator('.surface .sheet-editor').first().screenshot({ path: path.join(OUT_DIR, 'pendones.png'), animations: 'disabled' });
  await testInfo.attach('pendones.png', { path: path.join(OUT_DIR, 'pendones.png') });
  await page.getByRole('button', { name: 'Cerrar' }).first().click();

    // Excel: Orden de compra
    const ocPath = await uploadXlsx('ORDEN_DE_COMPRA.xlsx');
    const ocWb = XLSX.read(fs.readFileSync(ocPath));
    const ocFirst = ocWb.SheetNames[0];
    const ocRows: unknown[][] = XLSX.utils.sheet_to_json(ocWb.Sheets[ocFirst], { header: 1, defval: '' }) as any;
    expect(ocRows.flat().some((cell) => String(cell).toUpperCase().includes('ORDEN') || String(cell).toUpperCase().includes('COMPRA'))).toBeTruthy();
    const ocRow = page.locator('.hub-item', { hasText: 'ORDEN_DE_COMPRA.xlsx' }).first();
    await ocRow.getByRole('button', { name: /Ver|Ver \/ Editar/ }).click();
  await expect(page.locator('.surface .sheet-editor').first()).toBeVisible();
  await page.locator('.surface .sheet-editor').first().screenshot({ path: path.join(OUT_DIR, 'oc.png'), animations: 'disabled' });
  await testInfo.attach('oc.png', { path: path.join(OUT_DIR, 'oc.png') });
  await page.getByRole('button', { name: 'Cerrar' }).first().click();

  // Excel: edición y recálculo (crear una suma simple propia para validar HF)
  // Reabre Campaña y entra a edición explícita
  await campRow.getByRole('button', { name: /^Editar$/ }).click();
    const editor = page.locator('.surface .sheet-editor').first();
    await expect(editor).toBeVisible();
  // Si aparece la guía inicial, ciérrala para no tapar controles
  const coachDismiss = page.locator('.editor-coach__dismiss');
  if (await coachDismiss.isVisible({ timeout: 500 }).catch(() => false)) {
    await coachDismiss.click();
  }
  // Asegura que las celdas sean realmente editables (no solo visor)
  await expect(page.getByLabel('Celda A24', { exact: true })).toBeEditable();
    // Escribir datos en A24 y A25 y fórmula en A26
    await page.getByLabel('Celda A24', { exact: true }).fill('1');
    await page.getByLabel('Celda A25', { exact: true }).fill('2');
    await page.getByLabel('Celda A26', { exact: true }).click();
    await page.getByLabel('Editar A26', { exact: true }).fill('=A24+A25');
    // Seleccionar fórmula para mostrar en barra fx
    await page.getByLabel('Celda A26', { exact: true }).click();
    // Debe valer 3 y no se muestran fórmulas visibles
    await expect(page.getByLabel('Celda A26', { exact: true })).toHaveValue('3');
    const anyFormula = await page.$$eval('.sheet__cell', (els) => els.some((e) => (e as HTMLInputElement).value.trim().startsWith('=')));
    expect(anyFormula).toBeFalsy();
    // Contrastes mínimos en oscuro (celda activa y TODAS las acciones de toolbar y herramientas)
    await expectContrast(page, '.sheet__cell:focus', 4.5);
    const enabledButtons = page.locator('.sheet-toolbar .btn:not([disabled]), .sheet-tools .btn:not([disabled])');
    const n = await enabledButtons.count();
    for (let i = 0; i < n; i += 1) {
      const handle = enabledButtons.nth(i);
      await handle.scrollIntoViewIfNeeded();
      const { ok, ratio, sel } = await handle.evaluate((el) => {
        function srgbToLinear(c: number): number {
          const cs = c / 255;
          return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
        }
        function luminance(rgb: [number, number, number]): number {
          const [r, g, b] = rgb.map((x) => srgbToLinear(x as number)) as [number, number, number];
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        function parseCssColor(s: string): [number, number, number] | null {
          const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s);
          if (!m) return null;
          return [Number(m[1]), Number(m[2]), Number(m[3])];
        }
        // Resolve effective background up the tree if transparent
        function effectiveBg(node: Element | null): string {
          while (node) {
            const cs = window.getComputedStyle(node);
            const bg = cs.backgroundColor || '';
            if (bg && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bg)) return bg;
            node = node.parentElement;
          }
          return 'rgb(255,255,255)';
        }
        const cs = window.getComputedStyle(el as Element);
        const fg = cs.color;
        const bg = effectiveBg(el);
        const fgRgb = parseCssColor(fg);
        const bgRgb = parseCssColor(bg);
        if (!fgRgb || !bgRgb) return { ok: false, ratio: 0, sel: (el as HTMLElement).outerHTML.slice(0, 64) };
        const l1 = luminance(fgRgb) + 0.05;
        const l2 = luminance(bgRgb) + 0.05;
        const ratio = l1 > l2 ? l1 / l2 : l2 / l1;
        return { ok: ratio >= 4.5, ratio, sel: (el as HTMLElement).innerText.slice(0, 24) };
      });
      expect(ok, `Low contrast for toolbar button "${sel}": ratio ${ratio.toFixed(2)}`).toBeTruthy();
    }
  // Banner compacto como mucho uno visible (no 3 apilados)
  const banners = await page.locator('.module-banner').count();
  expect(banners).toBeLessThanOrEqual(1);
    await editor.screenshot({ path: path.join(OUT_DIR, 'excel-editando.png'), animations: 'disabled' });
    await testInfo.attach('excel-editando.png', { path: path.join(OUT_DIR, 'excel-editando.png') });

    // Visor puro del mismo archivo
    await page.getByRole('button', { name: 'Cerrar' }).first().click();
    await campRow.getByRole('button', { name: /Ver|Ver \/ Editar/ }).click();
    const viewer = page.locator('.surface .sheet-editor').first();
    await expect(viewer).toBeVisible();
    await viewer.screenshot({ path: path.join(OUT_DIR, 'visor-excel.png'), animations: 'disabled' });
    await testInfo.attach('visor-excel.png', { path: path.join(OUT_DIR, 'visor-excel.png') });

    // Word: importar Checklist Producción
    const prodPath = await importDocx('CHECKLIST_PRODUCCION.docx');
    const prodHtml = (await mammoth.convertToHtml({ buffer: fs.readFileSync(prodPath) })).value || '';
    expect(/PRODUCCI[ÓO]N/i.test(prodHtml)).toBeTruthy();
    await page.locator('.docedit-app').first().screenshot({ path: path.join(OUT_DIR, 'checklist-produccion.png'), animations: 'disabled' });
    await testInfo.attach('checklist-produccion.png', { path: path.join(OUT_DIR, 'checklist-produccion.png') });

    // Word: importar Creación de boletera
    const bolPath = await importDocx('CREACION_BOLETERA.docx');
    const bolHtml = (await mammoth.convertToHtml({ buffer: fs.readFileSync(bolPath) })).value || '';
    expect(/BOLETERA/i.test(bolHtml)).toBeTruthy();
    await page.locator('.docedit-app').first().screenshot({ path: path.join(OUT_DIR, 'boletera.png'), animations: 'disabled' });
    await testInfo.attach('boletera.png', { path: path.join(OUT_DIR, 'boletera.png') });

    // Word: edición rápida y Tab al siguiente campo
    await page.locator('.docedit__title').fill('Prueba edición Word');
    const firstArea = page.locator('.docedit__text').first();
    await firstArea.fill('Campo 1');
    await firstArea.press('Tab');
    await page.locator('.docedit__text').nth(1).fill('Campo 2');
    await page.locator('.docedit-app').first().screenshot({ path: path.join(OUT_DIR, 'word-editando.png'), animations: 'disabled' });
    await testInfo.attach('word-editando.png', { path: path.join(OUT_DIR, 'word-editando.png') });

    // 5) Validación de calidad de PNG: >= 30 KB y >= 50 colores
    await expectPngQuality(path.join(OUT_DIR, 'campana.png'));
    await expectPngQuality(path.join(OUT_DIR, 'corrida.png'));
    await expectPngQuality(path.join(OUT_DIR, 'pendones.png'));
    await expectPngQuality(path.join(OUT_DIR, 'oc.png'));
    await expectPngQuality(path.join(OUT_DIR, 'visor-excel.png'));
    await expectPngQuality(path.join(OUT_DIR, 'excel-editando.png'));
    await expectPngQuality(path.join(OUT_DIR, 'checklist-produccion.png'));
    await expectPngQuality(path.join(OUT_DIR, 'boletera.png'));
    await expectPngQuality(path.join(OUT_DIR, 'word-editando.png'));
  });
});

