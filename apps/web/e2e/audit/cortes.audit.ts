import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { mockApi, mockAuthenticatedApi } from '../support/mock-api';
import { RICH_ROUTES, RICH_STUBS, RICH_USER } from '../support/rich-fixtures';
import { domAudit, type AuditResult } from './dom-audit';

/**
 * Recorrido de «cortes» (texto con «…», elementos recortados, scroll lateral,
 * controles encimados y contraste) por todas las pantallas del panel, en las dos
 * entidades y en cuatro tamaños de ventana. No es parte de la suite normal:
 *
 *   npx playwright test -c playwright.audit.config.ts
 *
 * Variables: AUDIT_TAG (prefijo de archivos, «antes»/«despues»), AUDIT_OUT
 * (carpeta de capturas y JSON), AUDIT_ONLY (filtro por nombre de ruta, regex),
 * AUDIT_VP (filtro de tamaños, p. ej. «1536x730»), AUDIT_ENTITY (ARTA|EXPLANADA),
 * AUDIT_SHOTS=0 para no guardar capturas, AUDIT_FULL=1 para capturar la página entera.
 */

const TAG = process.env.AUDIT_TAG || 'audit';
const OUT = process.env.AUDIT_OUT || join(process.cwd(), 'e2e', '.output', 'cortes');
const ONLY = process.env.AUDIT_ONLY ? new RegExp(process.env.AUDIT_ONLY) : null;
const SHOTS = process.env.AUDIT_SHOTS !== '0';
const FULL = process.env.AUDIT_FULL === '1';
const PORT = Number(process.env.E2E_PORT || 3100);

const VIEWPORTS = [
  { w: 1536, h: 730 },
  { w: 1536, h: 864 },
  { w: 1280, h: 720 },
  { w: 390, h: 844 },
].filter((v) => !process.env.AUDIT_VP || process.env.AUDIT_VP.split(',').includes(`${v.w}x${v.h}`));

const ENTITIES = (['ARTA', 'EXPLANADA'] as const).filter(
  (e) => !process.env.AUDIT_ENTITY || process.env.AUDIT_ENTITY === e,
);

type Step = { name: string; path: string; action?: (page: Page) => Promise<void>; mobileOnly?: boolean };

/** Capas que se abren encima de una pantalla: campana, cuenta, buscador y cajón del menú. */
const OVERLAYS: Step[] = [
  {
    name: 'enviados',
    path: '/notifications?tab=enviados',
    action: async (page) => {
      await page.locator('.sent-row').first().waitFor();
    },
  },
  {
    name: 'tablero',
    path: '/tasks',
    action: async (page) => {
      await page.getByRole('button', { name: 'Tablero' }).click();
      await page.locator('.board-card').first().waitFor();
    },
  },
  {
    name: 'chat-refs',
    path: '/chat?channel=ch-rich-general&msg=m-rich-g04b',
    action: async (page) => {
      await page.locator('#m-m-rich-g04b .ref-card').first().waitFor();
      await page.locator('#m-m-rich-g04b').scrollIntoViewIfNeeded();
    },
  },
  {
    name: 'chat-selector',
    path: '/chat?channel=ch-rich-general',
    action: async (page) => {
      const box = page.getByRole('textbox', { name: 'Mensaje' });
      await box.waitFor();
      await box.fill('revisen @');
      await box.press('End');
      await page.locator('.chat-mentions').waitFor();
      await page.getByRole('option', { name: /Cotizar/ }).first().waitFor();
    },
  },
  {
    name: 'chat-tarea',
    path: '/chat?channel=ch-rich-general',
    action: async (page) => {
      const box = page.getByRole('textbox', { name: 'Mensaje' });
      await box.waitFor();
      await box.fill('/tarea Cotizar luces y dimmers viernes');
      await page.locator('.chat-composer__task').waitFor();
    },
  },
  {
    name: 'chat-ligados',
    path: '/chat?channel=ch-rich-general',
    action: async (page) => {
      await page.getByRole('button', { name: /ligados a esta conversación/ }).click();
      await page.locator('.ref-panel').waitFor();
    },
  },
  {
    name: 'campana',
    path: '/dashboard',
    action: async (page) => {
      await page.locator('.notif-btn').click();
      await page.locator('.notif-panel').waitFor();
    },
  },
  {
    name: 'cuenta',
    path: '/dashboard',
    action: async (page) => {
      await page.locator('.account__btn').click();
      await page.locator('.account__menu').waitFor();
    },
  },
  {
    name: 'buscador',
    path: '/dashboard',
    action: async (page) => {
      const input = page.locator('.topbar-search__input');
      if (!(await input.isVisible())) await page.locator('.topbar-search').click();
      await input.click();
      await input.fill('ev');
      // Con el menú visible el buscador filtra el propio menú; si no, abre su lista.
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'menu-movil',
    path: '/dashboard',
    mobileOnly: true,
    action: async (page) => {
      await page.locator('.nav-toggle').click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'carpeta-abierta',
    path: '/folders',
    action: async (page) => {
      await page.locator('.folder-card').first().click();
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'tareas-que-pedi',
    path: '/tasks',
    action: async (page) => {
      await page.getByRole('tab', { name: 'Que pedí' }).click();
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'tareas-todas',
    path: '/tasks',
    action: async (page) => {
      await page.getByRole('tab', { name: 'Todas las tareas' }).click();
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'anticipo-detalle',
    path: '/advances',
    action: async (page) => {
      await page.locator('.adv-card').first().click();
      await page.locator('.modal-backdrop').waitFor();
    },
  },
  {
    name: 'evento-mas',
    path: '/events/evt-rich-1',
    action: async (page) => {
      await page.locator('.ev-more > summary').click();
      await page.locator('.ev-more__menu').waitFor();
    },
  },
];

async function settle(page: Page) {
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

function clean(r: AuditResult): AuditResult {
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

mkdirSync(OUT, { recursive: true });

for (const entity of ENTITIES) {
  for (const vp of VIEWPORTS) {
    const vpName = `${vp.w}x${vp.h}`;
    test(`cortes ${entity} ${vpName}`, async ({ browser }) => {
      test.setTimeout(30 * 60_000);
      const host = entity === 'ARTA' ? 'arta.localhost' : 'auditorio.localhost';
      const origin = `http://${host}:${PORT}`;
      const results: Array<AuditResult & { name: string }> = [];

      const steps: Step[] = [
        { name: 'login', path: '/login' },
        ...RICH_ROUTES.map((r) => ({ name: r.name, path: r.path })),
        ...OVERLAYS.filter((o) => !o.mobileOnly || vp.w < 768),
      ].filter((s) => !ONLY || ONLY.test(s.name));

      const base = join(OUT, `${TAG}-${entity === 'ARTA' ? 'arta' : 'audi'}-${vpName}`);
      /** Se escribe tras cada pantalla: si algo se cuelga, lo ya medido no se pierde. */
      const flush = () => {
        writeFileSync(`${base}.json`, JSON.stringify(results, null, 2));
        const count = (k: 'text' | 'clip' | 'overlap' | 'contrast') =>
          results.reduce((n, r) => n + r[k].filter((i) => !i.justified).length, 0);
        const line = [
          `${TAG} ${entity} ${vpName} (${results.length} pantallas)`,
          `texto ${count('text')}`,
          `recortes ${count('clip')}`,
          `scroll-sin-desvanecido ${results.reduce((n, r) => n + r.scrollers.filter((i) => !i.justified).length, 0)}`,
          `scroll-lateral ${results.filter((r) => r.hscroll && r.hscroll.kind !== 'error').length}`,
          `errores ${results.filter((r) => r.hscroll?.kind === 'error').length}`,
          `encimados ${count('overlap')}`,
          `contraste ${count('contrast')}`,
        ].join(' · ');
        writeFileSync(`${base}.txt`, `${line}
`);
        return line;
      };

      for (const step of steps) {
        const context = await browser.newContext({
          viewport: { width: vp.w, height: vp.h },
          reducedMotion: 'reduce',
          isMobile: vp.w < 768,
          hasTouch: vp.w < 768,
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        await page.addInitScript((ent) => {
          try {
            localStorage.setItem('arta_entity', ent);
          } catch {
            /* nada */
          }
        }, entity);
        if (step.name !== 'login') {
          await context.addCookies([
            { name: 'arta_session', value: '1', domain: host, path: '/' },
            { name: 'arta_csrf', value: 'e2e-csrf-token', domain: host, path: '/' },
          ]);
          await mockAuthenticatedApi(page, { ...RICH_STUBS, '/auth/me': { user: RICH_USER } });
        } else {
          // Sin sesión: el default de `mockApi` ya responde 401 en `/auth/me`.
          await mockApi(page);
        }

        try {
          await page.goto(origin + step.path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
          await settle(page);
          if (step.action) {
            await step.action(page);
            await page.waitForTimeout(350);
          }
          // Lo que el panel deja para el siguiente cuadro (los desvanecidos de
          // `useShellPolish` se ponen en un requestAnimationFrame): se mide después.
          // WebKit sin ventana a veces lo atrasa; el tope evita colgarse.
          const frameMs = await page.evaluate(
            () =>
              new Promise<number>((resolve) => {
                const t0 = performance.now();
                const done = () => resolve(Math.round(performance.now() - t0));
                setTimeout(done, 2000);
                requestAnimationFrame(() => requestAnimationFrame(done));
              }),
          );
          if (frameMs > 300) console.log(`${entity} ${vpName} ${step.name}: dos cuadros tardaron ${frameMs} ms`);
          const res = clean(await page.evaluate(domAudit));
          results.push({ name: step.name, ...res });
          if (SHOTS) {
            await page.screenshot({ path: `${base}-${step.name}.png`, fullPage: FULL });
          }
        } catch (err) {
          results.push({
            name: step.name,
            url: step.path,
            viewport: { w: vp.w, h: vp.h },
            hscroll: { kind: 'error', path: step.path, detail: String(err).slice(0, 300) },
            text: [],
            clip: [],
            scrollers: [],
            overlap: [],
            contrast: [],
          });
        }
        await context.close();
        flush();
      }

      console.log(flush());
      expect(results.length).toBeGreaterThan(0);
    });
  }
}
