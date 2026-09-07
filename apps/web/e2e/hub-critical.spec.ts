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
    });

    await page.route('**/uploads/camp-gastos.xlsx', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: demoWorkbook(),
      }),
    );

    await page.goto('/campaigns');
    await page.getByRole('button', { name: /Archivos \(1\)/ }).click();
    await page.getByRole('button', { name: 'Editar aquí' }).click();
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

    await page.route('**/uploads/demo.xlsx', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: demoWorkbook(),
      }),
    );

    await page.goto('/events/evt-e2e-1?tab=files');
    await page.getByRole('button', { name: 'Editar aquí' }).click();
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
    await expect(page.getByRole('status')).toContainText('Ventana de OC abierta');
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
    await expect(page.getByRole('status')).toContainText('Ventana de OC cerrada');
  });

  test('Corrida: guardar finanzas del evento', async ({ page, baseURL }) => {
    let patched = false;
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': EVENT_FINANCE,
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
      '/finance/fin-e2e-1': (route: Route) => {
        if (route.request().method() === 'PATCH') {
          patched = true;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'fin-e2e-1', locked: false }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EVENT_FINANCE.financeRuns[0]),
        });
      },
    });

    await page.goto('/events/evt-e2e-1?tab=finance');
    // La corrida oficial es el Excel; la tabla simple es un resumen opcional
    // que se despliega a mano.
    await page.getByRole('button', { name: 'Mostrar tabla simple' }).click();
    const saveBtn = page.getByRole('button', { name: 'Guardar resumen' });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    await expect.poll(() => patched).toBe(true);
    await expect(page.getByText('Corrida guardada')).toBeVisible();
  });
});
