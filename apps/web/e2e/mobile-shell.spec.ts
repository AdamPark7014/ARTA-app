import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { mockApi, mockAuthenticatedApi, seedSession, TEST_EVENTS } from './support/mock-api';

/**
 * Panel en teléfono (390 px) y «modo app» (docs/PARIDAD-MOVIL-CONTRATO.md §3).
 *
 * Las apps nativas abren todo módulo sin pantalla propia en una vista web cuyo
 * User-Agent lleva `ArtaApp/`. Ahí la web no debe pintar barra lateral, barra
 * superior ni campana (las pone la app) y nada puede desbordar a lo ancho.
 * Las capturas quedan en `e2e/__mobile__/` para revisión a ojo.
 */

const WIDTH = 390;
const HEIGHT = 844;
const APP_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/129.0.0.0 Mobile Safari/537.36 ArtaApp/0.2.0 (Android 14; test)';
const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SHOTS = path.join(__dirname, '__mobile__');

const EVENT = {
  ...TEST_EVENTS[0],
  promoter: 'Arta Producciones',
  city: 'Puebla',
  entity: 'ARTA',
  campaignType: 'INTERNAL',
  endsAt: null,
  notes: '',
  checklists: [],
  purchaseOrders: [],
  financeRuns: [],
  campaign: null,
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

const EVENT_STUBS = {
  '/events/evt-e2e-1': EVENT,
  '/documents/event/evt-e2e-1': [],
  '/vendor/event/evt-e2e-1': [],
};

const EVENT_TABS = [
  'overview',
  'checklists',
  'ocs',
  'finance',
  'campaign',
  'sponsors',
  'ticketing',
  'tasks',
  'files',
];

const MODULES: Array<[name: string, url: string]> = [
  ['dashboard', '/dashboard'],
  ['tasks', '/tasks'],
  ['calendar', '/calendar'],
  ['events', '/events?scope=active'],
  ...EVENT_TABS.map((tab): [string, string] => [`event-${tab}`, `/events/evt-e2e-1?tab=${tab}`]),
  ['events-new', '/events/new'],
  ['advances', '/advances'],
  ['purchase-orders', '/purchase-orders'],
  ['finance', '/finance'],
  ['folders', '/folders'],
  ['checklists', '/checklists'],
  ['campaigns', '/campaigns'],
  ['press', '/press'],
  ['ticketing', '/ticketing'],
  ['hospitality', '/hospitality'],
  ['transport', '/transport'],
  ['catering', '/catering'],
  ['maintenance', '/maintenance'],
  ['settings', '/settings'],
  ['users', '/users'],
];

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.shell--loading')).toHaveCount(0);
  await page.waitForTimeout(250);
}

/** Ancho desbordado de la página; 0 si cabe. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate((width) => {
    const el = document.scrollingElement || document.documentElement;
    return Math.max(0, el.scrollWidth - Math.min(window.innerWidth, width) - 1);
  }, WIDTH);
}

test.describe('Modo app (vista web de las apps nativas)', () => {
  test.use({
    viewport: { width: WIDTH, height: HEIGHT },
    userAgent: APP_UA,
    isMobile: true,
    hasTouch: true,
  });

  for (const [name, url] of MODULES) {
    test(`${name} cabe en 390 px sin barra lateral`, async ({ page, baseURL }) => {
      await seedSession(page, baseURL!);
      await mockAuthenticatedApi(page, EVENT_STUBS);

      await page.goto(url);
      await settle(page);

      await expect(page.locator('html')).toHaveAttribute('data-shell', 'app');
      await expect(page.locator('body')).toHaveAttribute('data-shell', 'app');
      await expect(page.getByText('Application error')).toHaveCount(0);
      await expect(page.locator('.content')).toBeVisible();
      await expect(page.locator('#app-sidebar')).toBeHidden();
      await expect(page.locator('.topbar')).toBeHidden();
      await expect(page.locator('.notif-btn')).toBeHidden();

      await page.screenshot({ path: path.join(SHOTS, `app-${name}.png`), fullPage: true });
      expect(await horizontalOverflow(page), `${url} desborda a lo ancho`).toBe(0);
    });
  }

  test('sin sesión manda a /login y el login también va en modo app', async ({ page }) => {
    await mockApi(page);

    await page.goto('/tasks');

    const url = new URL(page.url());
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe('/tasks');
    await expect(page.locator('html')).toHaveAttribute('data-shell', 'app');
    await page.screenshot({ path: path.join(SHOTS, 'app-login.png'), fullPage: true });
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe('Navegador de teléfono', () => {
  test.use({
    viewport: { width: WIDTH, height: HEIGHT },
    userAgent: PHONE_UA,
    isMobile: true,
    hasTouch: true,
  });

  test('el menú es un cajón con hamburguesa', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    await page.goto('/dashboard');
    await settle(page);

    await expect(page.locator('html')).not.toHaveAttribute('data-shell', 'app');
    const sidebar = page.locator('#app-sidebar');
    await expect(sidebar).not.toBeInViewport();
    await expect(page.locator('.topbar')).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await page.screenshot({ path: path.join(SHOTS, 'web-dashboard.png'), fullPage: true });

    const burger = page.getByRole('button', { name: 'Menú' });
    await expect(burger).toBeVisible();
    await burger.tap();
    await expect(sidebar).toBeInViewport();
    await page.screenshot({ path: path.join(SHOTS, 'web-drawer.png') });

    await sidebar
      .getByRole('navigation', { name: 'Módulos del panel' })
      .getByRole('link', { name: 'Tareas' })
      .tap();
    await page.waitForURL('**/tasks**');
    await expect(sidebar).not.toBeInViewport();
  });
});
