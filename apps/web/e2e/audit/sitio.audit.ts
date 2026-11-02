import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { mockStudio, PRACTICANTE_USER, siteState } from '../support/site-fixtures';
import { domAudit, type AuditResult } from './dom-audit';

/**
 * Capturas y auditoría de «cortes» del sitio público y de Studio, a 1536 y 390 px:
 *
 *   npx playwright test -c playwright.audit.config.ts sitio
 *
 * El sitio se revisa en la vista previa (`/site`), que pinta la misma página en el navegador: las
 * páginas públicas arman su contenido en el servidor y `page.route` no ve ese `fetch`.
 * Variables: AUDIT_OUT (carpeta de capturas y JSON), AUDIT_FULL=0 para solo la primera pantalla.
 */
const OUT = process.env.AUDIT_OUT || join(process.cwd(), 'e2e', '.output', 'sitio');
const FULL = process.env.AUDIT_FULL !== '0';
// Esta configuración no trae `baseURL`: `arta.localhost` es el panel, como en `playwright.config.ts`.
const ORIGIN = `http://arta.localhost:${process.env.E2E_PORT || 3100}`;

const VIEWPORTS = [
  { w: 1536, h: 864 },
  { w: 390, h: 844 },
];

type Step = { name: string; path: string; action?: (page: Page) => Promise<void>; practicante?: boolean };

const STEPS: Step[] = [
  { name: 'sitio', path: '/site?embed=1&modo=publicado' },
  { name: 'sitio-borradores', path: '/site?embed=1' },
  { name: 'sitio-cartelera', path: '/site?embed=1&modo=publicado&pagina=cartelera' },
  { name: 'sitio-show', path: '/site?embed=1&modo=publicado&pagina=cartelera&slug=los-ecos' },
  { name: 'sitio-nosotros', path: '/site?embed=1&modo=publicado&pagina=nosotros' },
  { name: 'sitio-servicios', path: '/site?embed=1&modo=publicado&pagina=servicios' },
  { name: 'sitio-servicio', path: '/site?embed=1&modo=publicado&pagina=servicios&slug=produccion' },
  { name: 'sitio-noticias', path: '/site?embed=1&modo=publicado&pagina=noticias' },
  { name: 'sitio-noticia', path: '/site?embed=1&modo=publicado&pagina=noticias&slug=festival-de-verano' },
  { name: 'sitio-historias', path: '/site?embed=1&modo=publicado&pagina=historias' },
  { name: 'sitio-galeria', path: '/site?embed=1&modo=publicado&pagina=galeria' },
  { name: 'sitio-preguntas', path: '/site?embed=1&modo=publicado&pagina=preguntas' },
  { name: 'sitio-contacto', path: '/site?embed=1&modo=publicado&pagina=contacto' },
  {
    name: 'sitio-menu',
    path: '/site?embed=1&modo=publicado',
    action: async (page) => {
      const toggle = page.getByRole('button', { name: 'Abrir menú' });
      if (await toggle.isVisible()) await toggle.click();
    },
  },
  {
    name: 'sitio-historia',
    path: '/site?embed=1&modo=publicado',
    action: async (page) => {
      await page.getByRole('button', { name: /^Ver historia/ }).first().click();
      await page.getByRole('dialog').waitFor();
    },
  },
  { name: 'studio-inicio', path: '/studio' },
  { name: 'studio-servicios', path: '/studio?bloque=servicios' },
  { name: 'studio-contacto', path: '/studio?bloque=contacto' },
  { name: 'studio-cartelera', path: '/studio?bloque=cartelera' },
  {
    name: 'studio-show-nuevo',
    path: '/studio?bloque=cartelera',
    action: async (page) => {
      await page.getByRole('button', { name: '+ Agregar show' }).click();
    },
  },
  { name: 'studio-historias', path: '/studio?bloque=historias' },
  { name: 'studio-nosotros', path: '/studio?bloque=nosotros' },
  { name: 'studio-datos', path: '/studio?bloque=ajustes' },
  { name: 'studio-practicante', path: '/studio?bloque=historias', practicante: true },
];

async function settle(page: Page) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(600);
  // Las secciones entran al bajar: se recorre la página para que todas estén pintadas.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.w}×${viewport.h}`, () => {
    test.use({ viewport: { width: viewport.w, height: viewport.h }, hasTouch: viewport.w < 600 });

    for (const step of STEPS) {
      test(step.name, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));

        await mockStudio(page, siteState(), step.practicante ? PRACTICANTE_USER : undefined);
        await page.goto(`${ORIGIN}${step.path}`);
        await settle(page);
        if (step.action) {
          await step.action(page);
          await page.waitForTimeout(300);
        }

        mkdirSync(OUT, { recursive: true });
        const tag = `${step.name}-${viewport.w}`;
        await page.screenshot({ path: join(OUT, `${tag}.png`), fullPage: FULL && !step.action });

        const audit: AuditResult = await page.evaluate(domAudit);
        writeFileSync(join(OUT, `${tag}.json`), JSON.stringify(audit, null, 2));

        expect(errors, 'errores de la página').toEqual([]);
        expect(audit.hscroll, 'scroll lateral').toBeNull();
      });
    }
  });
}
