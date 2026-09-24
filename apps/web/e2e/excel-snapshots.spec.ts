import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { mockAuthenticatedApi, seedSession } from './support/mock-api';
import { E2E_ORIGIN } from '../playwright.config';

function workbookWithTotals(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Concepto', 'Cantidad', 'Costo', 'Total'],
    ['Audio', 2, 6000, null],
    ['Luces', 1, 8000, null],
  ]);
  (ws as any)['D2'] = { t: 'n', f: 'B2*C2' };
  (ws as any)['D3'] = { t: 'n', f: 'B3*C3' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Campaña');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function financeWorkbook(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Concepto', 'Tipo', 'Monto'],
    ['Boletos', 'income', 120000],
    ['Audio', 'expense', 30000],
    ['Luces', 'expense', 20000],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Corrida');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

test('screenshots: Campaña y Corrida (antes/después)', async ({ page, baseURL }) => {
  await seedSession(page, baseURL!);
  await mockAuthenticatedApi(page, {
    '/events/evt-e2e-2': {
      id: 'evt-e2e-2',
      name: 'Show de prueba',
      artist: 'Artista Demo',
      venue: 'Auditorio Arema',
      city: 'Puebla',
      status: 'ACTIVE',
      entity: 'ARTA',
      campaignType: 'INTERNAL',
      startsAt: '2026-09-20T02:00:00.000Z',
      checklists: [],
      purchaseOrders: [],
      financeRuns: [],
      campaign: null,
      ticketingSetups: [],
      files: [
        { id: 'camp', fileName: 'Campaña.xlsx', url: '/uploads/camp.xlsx', kind: 'excel', module: 'CAMPAIGN', createdAt: '2026-08-28T10:00:00.000Z' },
        { id: 'corr', fileName: 'Corrida.xlsx', url: '/uploads/corr.xlsx', kind: 'excel', module: 'FINANCE', createdAt: '2026-08-28T10:00:00.000Z' },
      ],
      tasks: [],
      sponsors: [],
    },
    '/documents/event/evt-e2e-2': [],
    '/vendor/event/evt-e2e-2': [],
  });

  await page.route('**/uploads/camp.xlsx', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: workbookWithTotals(),
    }),
  );
  await page.route('**/api/files/camp/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: workbookWithTotals(),
    }),
  );
  await page.route('**/uploads/corr.xlsx', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: financeWorkbook(),
    }),
  );
  await page.route('**/api/files/corr/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: financeWorkbook(),
    }),
  );

  await page.goto('/events/evt-e2e-2?tab=files');

  // Campaña: Ver (modo visor), luego tomar capturas simple y con formato
  await page.getByRole('button', { name: 'Ver' }).first().click();
  await expect(page.getByRole('button', { name: 'Vista con formato' })).toBeVisible();
  const sheetRegion = page.locator('.sheet-editor').first();
  // Antes (vista simple)
  await sheetRegion.screenshot({ path: '/opt/cursor/artifacts/campana-antes.png', animations: 'disabled' });
  // Después (con formato)
  await page.getByRole('button', { name: 'Vista con formato' }).click();
  await sheetRegion.screenshot({ path: '/opt/cursor/artifacts/campana-despues.png', animations: 'disabled' });

  // Corrida: segundo archivo
  await page.getByRole('button', { name: 'Ver' }).nth(1).click();
  await expect(page.getByRole('button', { name: 'Vista con formato' }).nth(1)).toBeVisible();
  const corrRegion = page.locator('.sheet-editor').nth(1);
  await corrRegion.screenshot({ path: '/opt/cursor/artifacts/corrida-antes.png', animations: 'disabled' });
  // Formato
  await page.getByRole('button', { name: 'Vista con formato' }).nth(1).click();
  await corrRegion.screenshot({ path: '/opt/cursor/artifacts/corrida-despues.png', animations: 'disabled' });

  // Guarda rutas de verificación en consola para el PR body (no aserciones duras)
  console.log('ARTIFACTS', [
    '/opt/cursor/artifacts/campana-antes.png',
    '/opt/cursor/artifacts/campana-despues.png',
    '/opt/cursor/artifacts/corrida-antes.png',
    '/opt/cursor/artifacts/corrida-despues.png',
  ]);
});

