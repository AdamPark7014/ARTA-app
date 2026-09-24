import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { mockAuthenticatedApi, seedSession } from './support/mock-api';

function campWorkbook(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['GASTOS DE PUBLICIDAD Y CONVENIOS', '', '', ''],
    ['Concepto', 'Cantidad', 'Costo unitario', 'Total'],
    ['Audio', 2, 6000, null],
    ['Luces', 1, 8000, null],
  ]);
  (ws as any)['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  (ws as any)['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
  (ws as any)['D3'] = { t: 'n', f: 'B3*C3' };
  (ws as any)['D4'] = { t: 'n', f: 'B4*C4' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Campaña');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

test('SheetEditor abre sin error, muestra contenido y recalcula fórmula', async ({ page, baseURL }) => {
  await seedSession(page, baseURL!);
  await mockAuthenticatedApi(page, {
    '/events/evt-1': {
      id: 'evt-1',
      name: 'Show',
      artist: 'Artista',
      venue: 'Auditorio',
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
      files: [{ id: 'camp', fileName: 'Campaña.xlsx', url: '/uploads/camp.xlsx', kind: 'excel', module: 'CAMPAIGN', createdAt: '2026-08-28T10:00:00.000Z' }],
      tasks: [],
      sponsors: [],
    },
    '/documents/event/evt-1': [],
    '/vendor/event/evt-1': [],
  });
  await page.route('**/api/files/camp/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: campWorkbook(),
    }),
  );

  await page.goto('/events/evt-1?tab=files');
  await page.getByRole('button', { name: 'Ver' }).first().click();

  // No tarjeta de error y contenido visible
  await expect(page.locator('.sheet-state--error')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Concepto' })).toBeVisible();

  // Editar y verificar recálculo (B3=2, C3=6000 => D3=12000; cambia a B3=3,C3=5000 => 15000)
  await page.getByRole('button', { name: 'Ocultar' }).first().click();
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.getByLabel('Celda B3', { exact: true }).fill('3');
  await page.getByLabel('Celda C3', { exact: true }).fill('5000');
  // D3 debe mostrar 15000 (valor calculado en vista)
  await expect(page.getByLabel('Celda D3', { exact: true })).toHaveValue('15000');
});

