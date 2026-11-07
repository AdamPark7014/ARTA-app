import { expect, test, type Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * 07-11-2026: funciones que ya existían en el API sin botón en el web. Boletera con «Sincronizar
 * vendidos» y el avance de ventas, Seguridad con los dispositivos de avisos y el ancla de Días de cobro.
 */

const SELL_THROUGH = {
  entity: 'ARTA',
  kpis: {
    setups: 1,
    capacityTotal: 1200,
    soldTotal: 900,
    sellThroughPct: 75,
    potentialRevenue: 600000,
    realizedRevenue: 450000,
    avgTicket: 500,
    holdRisk: 0,
    eventsCovered: 1,
  },
  ranking: [],
  rows: [
    {
      id: 'tk-1',
      boletera: 'Boletia',
      holdUntil: '2030-12-01T00:00:00.000Z',
      holdExpired: false,
      holdDays: 40,
      artist: 'Los Ecos',
      promoter: null,
      capacity: 1200,
      sold: 900,
      sellThroughPct: 75,
      potentialRevenue: 600000,
      realizedRevenue: 450000,
      zoneCount: 2,
      zones: [],
      event: { id: 'evt-e2e-1', name: 'Noche de Bandas', artist: 'Los Ecos', status: 'ACTIVE', startsAt: '2026-09-20T02:00:00.000Z' },
    },
  ],
};

const DEVICES = [
  { id: 'dev-1', platform: 'ios', deviceName: 'iPhone de Ana', appVersion: '1.0.2', lastSeenAt: '2026-11-06T18:00:00.000Z' },
  { id: 'dev-2', platform: 'android', deviceName: null, appVersion: '1.0.4', lastSeenAt: '2026-11-05T12:00:00.000Z' },
];

test.describe('Boletera', () => {
  test('enseña el avance de ventas por boletera y sincroniza los vendidos', async ({ page, baseURL }) => {
    const syncs: string[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/ticketing': [],
      '/analytics/ticketing': SELL_THROUGH,
      '/ticketing/sync': (route: Route) => {
        syncs.push(route.request().method());
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ updated: 1, failed: 0, total: 1 }),
        });
      },
    });
    await page.goto('/ticketing');

    const strip = page.getByRole('region', { name: 'Avance de ventas' });
    await expect(strip).toBeVisible();
    await expect(strip.getByRole('link', { name: 'Noche de Bandas' })).toBeVisible();
    await expect(strip.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    await expect(strip.getByRole('cell', { name: /75 %/ })).toBeVisible();
    await expect(strip.getByText(/450,000/).first()).toBeVisible();
    await expect(strip.getByText(/600,000/).first()).toBeVisible();
    await expect(strip.getByText(/Apartado hasta/)).toBeVisible();

    await page.getByRole('button', { name: 'Sincronizar vendidos' }).click();
    await expect.poll(() => syncs).toEqual(['POST']);
    await expect(page.getByText('Vendidos al día · 1 boletera actualizada de 1')).toBeVisible();
  });
});

test.describe('Seguridad', () => {
  test('lista los dispositivos con notificaciones', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, { '/auth/sessions': [], '/devices': DEVICES });
    await page.goto('/security');

    const list = page.getByRole('list', { name: 'Dispositivos con notificaciones' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list.getByText('iPhone de Ana')).toBeVisible();
    await expect(list.getByText('Dispositivo Android')).toBeVisible();
    await expect(list.getByText('v1.0.4')).toBeVisible();
  });
});

test.describe('Configuración', () => {
  test('la tarjeta de días de cobro tiene su ancla', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications/preferences': { muted: [], quietHours: { enabled: false, start: '22:00', end: '07:00' } },
    });
    await page.goto('/settings#dias-de-cobro');

    const card = page.locator('#dias-de-cobro');
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/anchor-top/);
    await expect(card.getByRole('heading', { name: 'Días de cobro' })).toBeVisible();
  });
});
