import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
import * as XLSX from 'xlsx';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Hub crítico: Campaña (editar hoja), ExpandBox Esc con dirty, ventana OC,
 * corrida financiera (guardar). Todo con API mock — sin BD real.
 */

function demoWorkbook(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Concepto', 'Monto'],
    ['Audio', 12000],
    ['Luces', 8000],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

const CAMPAIGN_ROWS = [
  {
    id: 'camp-e2e-1',
    type: 'INTERNAL',
    authorized: false,
    notes: 'Promo radio',
    dataJson: { channels: 'Radio', budget: 50000 },
    event: {
      id: 'evt-e2e-1',
      name: 'Noche de Bandas',
      entity: 'ARTA',
      artist: 'Los Ecos',
      status: 'ACTIVE',
    },
    files: [
      {
        id: 'camp-xlsx',
        fileName: 'Hoja-gastos.xlsx',
        url: '/uploads/camp-gastos.xlsx',
        kind: 'excel',
        createdAt: '2026-08-28T10:00:00.000Z',
      },
    ],
  },
];

const EVENT_FINANCE = {
  id: 'evt-e2e-1',
  name: 'Noche de Bandas',
  artist: 'Los Ecos',
  venue: 'Auditorio Arema',
  city: 'Puebla',
  status: 'ACTIVE',
  entity: 'ARTA',
  campaignType: 'INTERNAL',
  startsAt: '2026-09-20T02:00:00.000Z',
  checklists: [],
  purchaseOrders: [],
  financeRuns: [
    {
      id: 'fin-e2e-1',
      locked: false,
      dataJson: {
        rows: [
          { type: 'income', concept: 'Taquilla', amount: 100000 },
          { type: 'expense', concept: 'Audio', amount: 20000 },
        ],
        totalIncome: 100000,
        totalExpense: 20000,
      },
    },
  ],
  campaign: null,
  ticketingSetups: [],
  files: [
    {
      id: 'file-xlsx',
      fileName: 'Presupuesto.xlsx',
      url: '/uploads/demo.xlsx',
      kind: 'excel',
      module: null,
      createdAt: '2026-08-28T10:00:00.000Z',
    },
  ],
  tasks: [],
  sponsors: [],
};

test.describe('Hub crítico', () => {
  test('Campaña: abrir hoja de gastos para editar', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/campaigns': CAMPAIGN_ROWS,
      '/events/evt-e2e-1': {
        ...EVENT_FINANCE,
        financeRuns: [],
        files: [
          {
            id: 'camp-xlsx',
            fileName: 'Hoja-gastos.xlsx',
            url: '/uploads/camp-gastos.xlsx',
            kind: 'excel',
            module: 'campaign',
            createdAt: '2026-08-28T10:00:00.000Z',
          },
        ],
      },
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
    });

    await page.route('**/api/files/camp-xlsx/inline', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: demoWorkbook(),
      }),
    );

    await page.goto('/campaigns');
    await page.getByRole('link', { name: 'Ver / Editar' }).click();
    await expect(page).toHaveURL(/\/events\/evt-e2e-1\?tab=campaign/);
    // La hoja de la campaña ya viene abierta al entrar.
    await expect(page.getByLabel('Celda A1', { exact: true })).toHaveValue('Concepto');
    // La hoja abre embebida en la campaña; ampliar es opcional (junta: sin
    // overlays blancos encima del contenido).
    await expect(page.getByRole('button', { name: /Ampliar a pantalla completa/ })).toBeVisible();
  });

  test('ExpandBox: Esc con dirty pide confirmación', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': EVENT_FINANCE,
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
    });

    await page.route('**/api/files/file-xlsx/inline', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: demoWorkbook(),
      }),
    );

    await page.goto('/events/evt-e2e-1?tab=files');
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByRole('button', { name: /Ampliar a pantalla completa/ }).click();
    await page.getByLabel('Celda A4', { exact: true }).fill('Transporte');

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/cambios sin guardar/i);
      await dialog.dismiss();
    });
    await page.keyboard.press('Escape');

    // Sigue en pantalla completa porque se canceló el diálogo
    await expect(page.getByRole('button', { name: /Salir de pantalla completa/ })).toBeVisible();
  });

  test('OC: banner de ventana abierta (fixture settings)', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/purchase-orders': [],
      '/purchase-orders/window': {
        config: {
          enabled: true,
          days: [1, 4],
          start: '10:00',
          end: '14:00',
          timeZone: 'America/Mexico_City',
          note: '',
        },
        open: true,
        scheduleLabel: 'lunes y jueves de 10:00 a 14:00',
        nextOpenLabel: null,
        nowMinutes: 660,
        canRequestNow: true,
        bypass: false,
        canEdit: true,
      },
    });

    await page.goto('/purchase-orders');
    // Ya no es un banner: la regla se ve en una línea, con un punto cuando hoy se cobra.
    const note = page.locator('.oc-paydays');
    await expect(note).toContainText('lunes y jueves de 10:00 a 14:00');
    await expect(note).toContainText('Hoy es día de cobro');
    await expect(note.locator('.oc-dot')).toHaveClass(/is-on/);
  });

  test('OC: banner de ventana cerrada', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/purchase-orders': [],
      '/purchase-orders/window': {
        config: {
          enabled: true,
          days: [1, 4],
          start: '10:00',
          end: '14:00',
          timeZone: 'America/Mexico_City',
          note: '',
        },
        open: false,
        scheduleLabel: 'lunes y jueves de 10:00 a 14:00',
        nextOpenLabel: 'el próximo lunes a las 10:00',
        nowMinutes: 900,
        canRequestNow: false,
        bypass: true,
        canEdit: true,
      },
    });

    await page.goto('/purchase-orders');
    const note = page.locator('.oc-paydays');
    await expect(note).toContainText('lunes y jueves de 10:00 a 14:00');
    await expect(note).toContainText('Próximo cobro: el próximo lunes a las 10:00');
    await expect(note.locator('.oc-dot')).not.toHaveClass(/is-on/);
  });

  test('Corrida: se genera desde el machote y el panel lo confirma', async ({ page, baseURL }) => {
    let generated = false;
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': EVENT_FINANCE,
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
      '/finance/event/evt-e2e-1/generate': (route: Route) => {
        generated = route.request().method() === 'POST';
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'fin-e2e-1' }),
        });
      },
    });

    await page.goto('/events/evt-e2e-1?tab=finance');
    // La corrida oficial es el Excel: se genera del machote o se sube, y se edita en el sitio.
    await page.getByRole('button', { name: 'Generar corrida' }).click();
    await expect.poll(() => generated).toBe(true);
    await expect(page.getByText('Corrida generada')).toBeVisible();
  });
});
