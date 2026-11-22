import type { Page } from '@playwright/test';

import type { AuditResult } from './dom-audit';

/** Como lo ve la gente que usa el panel: fechas y campos nativos en español de México. */
export const LOCALE = 'es-MX';

/** Espera a que la pantalla termine de cargar: red quieta, sin esqueletos y con las letras listas. */
export async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await Promise.race([page.waitForLoadState('networkidle'), page.waitForTimeout(8000)]);
  await page
    .waitForFunction(() => !document.querySelector('.shell--loading'), null, { timeout: 30000 })
    .catch(() => undefined);
  await page
    .waitForFunction(() => document.querySelectorAll('.skeleton, [aria-busy="true"]').length === 0, null, {
      timeout: 10000,
    })
    .catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(450);
}

/** Quita de la medición lo que pinta Next en desarrollo (su indicador y sus avisos). */
export function clean(r: AuditResult): AuditResult {
  const keep = (i: { path: string }) => !i.path.startsWith('nextjs-portal') && !i.path.includes('nextjs-portal');
  return {
    ...r,
    text: r.text.filter(keep),
    clip: r.clip.filter(keep),
    scrollers: r.scrollers.filter(keep),
    overlap: r.overlap.filter((i) => keep(i) && !/nextjs|__next-build/.test(i.detail || '')),
    contrast: r.contrast.filter(keep),
  };
}

/**
 * En desarrollo, la página se recarga sola cuando alguien guarda un archivo. Para que una captura no cambie a
 * media toma, el canal de recarga se deja abierto y mudo. En el build de producción no existe y no pasa nada.
 */
export async function quietDevReload(page: Page) {
  await page.routeWebSocket(/\/_next\/webpack-hmr/, () => undefined);
}

/** Esconde el indicador de Next en desarrollo para que no salga en la captura. */
export async function hideDevBadge(page: Page) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => undefined);
}
