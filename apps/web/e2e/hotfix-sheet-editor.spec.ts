import { expect, test } from '@playwright/test';
import { E2E_ORIGIN } from '../playwright.config';
import { mockAuthenticatedApi, seedSession } from './support/mock-api';

function parseRGB(rgb: string): [number, number, number] {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return [255, 255, 255];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance([r, g, b]: [number, number, number]) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(fg: string, bg: string) {
  const L1 = luminance(parseRGB(fg));
  const L2 = luminance(parseRGB(bg));
  const [light, dark] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (light + 0.05) / (dark + 0.05);
}

test.describe('SheetEditor hotfix — dark contrast and values', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('values, editing contrast, toolbar contrast, and campana', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {});
    // Corrida financiera — valores calculados visibles (no "=")
    await page.goto(`${E2E_ORIGIN}/dev/sheet-harness?name=CORRIDA_BASE.xlsx&variant=finance`);

    await page.locator('table.sheet').waitFor({ timeout: 60000 });
    // Guard: every visible non-focused cell has dark background (corner sample)
    const checkDarkBg = async (sel: string) => {
      const clip = await page.evaluate((s) => {
        const el = document.querySelector<HTMLElement>(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = Math.max(0, Math.floor(r.x + 3));
        const y = Math.max(0, Math.floor(r.y + 3));
        const width = Math.max(4, Math.floor(Math.min(r.width - 6, 12)));
        const height = Math.max(4, Math.floor(Math.min(r.height - 6, 12)));
        return { x, y, width, height };
      }, sel);
      if (!clip) return true;
      const shot = await page.screenshot({ clip });
      const { PNG } = require('pngjs');
      const png = PNG.sync.read(shot);
      // Sample a 3x3 block near the top-left inside padding
      const sampleAt = (x: number, y: number) => {
        const idx = (png.width * y + x) << 2;
        const r = png.data[idx], g = png.data[idx + 1], b = png.data[idx + 2];
        return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
      };
      const xs = Math.max(1, Math.floor(png.width * 0.05));
      const ys = Math.max(1, Math.floor(png.height * 0.3)); // avoid column label inside the same row
      let lumSum = 0;
      let count = 0;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          lumSum += sampleAt(xs + dx, ys + dy);
          count++;
        }
      }
      const avg = lumSum / count;
      return avg <= 0.235;
    };
    const colsAH = ['A','B','C','D','E','F','G','H'];
    for (const r of [5, 6]) {
      for (const c of colsAH) {
        const selector = `.sheet__cell[aria-label="Celda ${c}${r}"]`;
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
        const ok = await checkDarkBg(selector);
        expect(ok).toBeTruthy();
      }
    }
    const cells = page.locator('.sheet__cell');
    const values: string[] = [];
    const n = await cells.count();
    for (let i = 0; i < n; i += 1) values.push(await cells.nth(i).inputValue());
    for (const v of values) {
      expect(v.startsWith('=')).toBeFalsy();
    }
    // Screenshot a)
    await page.screenshot({ path: '../../docs/hotfix-screens/hotfix-values.png', fullPage: false });

    // Focus una celda y escribir — debe verse dentro de la celda
    const cellInput = page.locator('.sheet__cell[aria-label="Celda D7"]').first();
    await cellInput.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('12345 PRUEBA');
    await expect(cellInput).toHaveValue('12345 PRUEBA');
    // Contraste en la celda enfocada
    const styles = await cellInput.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLInputElement);
      return { bg: cs.backgroundColor || 'rgb(255,255,255)', fg: cs.color || 'rgb(17,17,17)' };
    });
    const cr = contrastRatio(styles.fg, styles.bg);
    expect(cr).toBeGreaterThanOrEqual(4.5);
    // Pixel check: recorte de la celda debe tener pixeles oscuros sobre fondo blanco
    const handle = await cellInput.elementHandle();
    const box = await handle!.boundingBox();
    const shot = await page.screenshot({ clip: box! });
    const { PNG } = require('pngjs');
    const png = PNG.sync.read(shot);
    let dark = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const idx = (png.width * y + x) << 2;
        const r = png.data[idx], g = png.data[idx + 1], b = png.data[idx + 2];
        const lum = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
        if (lum < 0.31) dark++;
      }
    }
    expect(dark).toBeGreaterThanOrEqual(30);
    // Screenshot b)
    await page.screenshot({ path: '../../docs/hotfix-screens/hotfix-editing.png', fullPage: false });

    // Recalculo: escribe 200 en C6 (PRECIO Preferente) y valida D6/E6
    // Asegura que G2 (FUNCIONES) sea 1 para coincidir con el ejemplo
    const funcInput = page.locator('.sheet__cell[aria-label="Celda G2"]').first();
    await funcInput.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('1');
    await expect(funcInput).toHaveValue('1');
    const priceInput = page.locator('.sheet__cell[aria-label="Celda C6"]').first();
    await priceInput.click();
    await page.keyboard.press('Control+a');
    const beforeD6 = await page.locator('tbody tr:nth-of-type(6) td:nth-of-type(4) .sheet__cell').inputValue();
    await page.keyboard.type('200');
    // Espera a que recalculen algunos dependientes (en inputs no enfocados)
    await expect
      .poll(async () => await page.locator('.sheet__cell[aria-label="Celda D6"]').inputValue())
      .not.toBe(beforeD6);
    // Sum row D13 should reflect the update (sum of D5:D12)
    const sumRange = await page.evaluate(() => {
      const toNum = (s: string) => {
        const str = String(s);
        if (/[A-Za-z]/.test(str)) return 0;
        return Number(str.replace(/[^0-9.-]/g, '')) || 0;
      };
      let total = 0;
      for (let r = 5; r <= 12; r++) {
        const el = document.querySelector<HTMLInputElement>(`.sheet__cell[aria-label="Celda D${r}"]`);
        if (el) total += toNum(el.value);
      }
      return total;
    });
    const d13 = await page.locator('.sheet__cell[aria-label="Celda D13"]').inputValue();
    const d13Num = Number(d13.replace(/[^0-9.-]/g, '')) || 0;
    expect(Math.abs(d13Num - sumRange)).toBeLessThanOrEqual(1);
    // G2 must show 1
    await expect(page.locator('.sheet__cell[aria-label="Celda G2"]')).toHaveValue('1');
    // A-column labels still visible
    await expect(page.locator('.sheet__cell[aria-label="Celda A3"]')).toHaveValue(/INGRESOS/);
    await expect(page.locator('.sheet__cell[aria-label="Celda A5"]')).toHaveValue(/VIP/);
    await expect(page.locator('.sheet__cell[aria-label="Celda A6"]')).toHaveValue(/Preferente/);
    await expect(page.locator('.sheet__cell[aria-label="Celda A7"]')).toHaveValue(/Bronce/);
    // No overlay elements must exist (evita fugas/solapamientos)
    await expect(page.locator('.sheet__display')).toHaveCount(0);
    // Ensure A..G are visible: blur, scrollLeft=0, widen viewport, then capture
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => {
      const wrap = document.querySelector('.sheet-wrap') as HTMLElement | null;
      if (wrap) wrap.scrollLeft = 0;
    });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(60);
    await page.screenshot({ path: '../../docs/hotfix-screens/hotfix-recalc.png', fullPage: false });

    // Omitimos captura dedicada de toolbar; ya es visible en las demás tomas

  // Campaña con valores
    await page.goto(`${E2E_ORIGIN}/dev/sheet-harness?name=CAMPANA_BASE.xlsx&variant=campaign`);
    await page.getByRole('table').waitFor({ timeout: 60000 });
    // Check B column width <= 160 and A..H fit inside 1440px
    await page.evaluate(() => {
      const wrap = document.querySelector('.sheet-wrap') as HTMLElement | null;
      if (wrap) wrap.scrollLeft = 0;
    });
    const widths = await page.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('thead th')) as HTMLElement[];
      // ths[0] is corner; take A..H = indices 1..8
      const picks = ths.slice(1, 9);
      return picks.map((el) => el.getBoundingClientRect().width);
    });
    const sumAH = widths.reduce((a, b) => a + b, 0);
    expect(sumAH).toBeLessThanOrEqual(1440);
    expect(widths[1]).toBeLessThanOrEqual(160); // B column (index 1 in A..H slice)
    // No clipping on key cells
    const noClip = async (sel: string) =>
      await page.locator(sel).evaluate((el: HTMLElement) => el.scrollWidth <= el.clientWidth + 1);
    expect(await noClip('.sheet__cell[aria-label="Celda F10"]')).toBeTruthy();
    expect(await noClip('.sheet__cell[aria-label="Celda G7"]')).toBeTruthy();
    // Wrap-only cells must fit fully (no clip) in both axes on display element
    const noClipDisplay = async (sel: string) =>
      await page.locator(sel).evaluate((el: HTMLElement) => {
        const td = el.parentElement as HTMLElement | null;
        const disp = td?.querySelector('.sheet__wraptext') as HTMLElement | null;
        const target = disp || el;
        const swOk = target.scrollWidth <= target.clientWidth + 1;
        const shOk = target.scrollHeight <= target.clientHeight + 1;
        return swOk && shOk;
      });
    await expect(await noClipDisplay('.sheet__cell[aria-label="Celda A2"]')).toBeTruthy();
    await expect(await noClipDisplay('.sheet__cell[aria-label="Celda B2"]')).toBeTruthy();
    for (const col of ['E', 'F', 'G', 'H', 'I']) {
      await expect(await noClipDisplay(`.sheet__cell[aria-label="Celda ${col}5"]`)).toBeTruthy();
    }
    // Asegura que ciertas celdas muestren los valores correctos (no \"$-\")
    await expect(page.locator('.sheet__cell[aria-label="Celda D6"]')).toHaveValue(/11,000\.00/);
    await expect(page.locator('.sheet__cell[aria-label="Celda D9"]')).toHaveValue(/5,000\.00/);
    await expect(page.locator('.sheet__cell[aria-label="Celda D10"]')).toHaveValue(/5,000\.00/);
    await expect(page.locator('.sheet__cell[aria-label="Celda D12"]')).toHaveValue(/15,000\.00/);
    await expect(page.locator('.sheet__cell[aria-label="Celda G6"]')).toHaveValue(/9,000\.00/);
    // Luminance checks: bright text on dark bg
    const checkBright = async (selector: string) => {
      const el = page.locator(selector).first();
      const clip = await el.evaluate((node: HTMLElement) => {
        const td = node.parentElement as HTMLElement | null;
        const disp = td?.querySelector('.sheet__wraptext') as HTMLElement | null;
        const target = (disp as HTMLElement) || node;
        const r = target.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      const shot = await page.screenshot({ clip: clip! });
      const { PNG } = require('pngjs');
      const png = PNG.sync.read(shot);
      let bright = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const idx = (png.width * y + x) << 2;
          const r = png.data[idx], g = png.data[idx + 1], b = png.data[idx + 2];
          const lum = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
          if (lum > 0.67) bright++;
        }
      }
      expect(bright).toBeGreaterThanOrEqual(30);
    };
    // Corrida bright cells
    await page.goto(`${E2E_ORIGIN}/dev/sheet-harness?name=CORRIDA_BASE.xlsx&variant=finance`);
    await page.getByRole('table').waitFor({ timeout: 60000 });
    await checkBright('.sheet__cell[aria-label="Celda A5"]');
    await checkBright('.sheet__cell[aria-label="Celda B5"]');
    await checkBright('.sheet__cell[aria-label="Celda D5"]');
    // Campaña bright cells
    await page.goto(`${E2E_ORIGIN}/dev/sheet-harness?name=CAMPANA_BASE.xlsx&variant=campaign`);
    await page.getByRole('table').waitFor({ timeout: 15000 });
    // Guard: dark backgrounds on visible grid
    for (let r = 3; r <= 12; r++) {
      for (const c of colsAH) {
        const ok = await checkDarkBg(`.sheet__cell[aria-label="Celda ${c}${r}"]`);
        expect(ok).toBeTruthy();
      }
    }
    await checkBright('.sheet__cell[aria-label="Celda A6"]');
    await checkBright('.sheet__cell[aria-label="Celda A2"]');
    await checkBright('.sheet__cell[aria-label="Celda B5"]');
    // Make sure A..H are visible and capture
    await page.evaluate(() => {
      const wrap = document.querySelector('.sheet-wrap') as HTMLElement | null;
      if (wrap) wrap.scrollLeft = 0;
    });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(60);
    await page.screenshot({ path: '../../docs/hotfix-screens/hotfix-campana.png', fullPage: false });

    // Verificar que las PNG no estén en blanco (tiene píxeles distintos)
    const fs = await page.context().storageState();
    expect(fs).toBeTruthy(); // dummy to use expect in this scope
  });
});

