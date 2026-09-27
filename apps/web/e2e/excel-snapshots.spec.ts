import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { mockAuthenticatedApi, seedSession } from './support/mock-api';
import { E2E_ORIGIN } from '../playwright.config';

function workbookCampana(): Buffer {
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

function workbookCorrida(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Concepto', 'Tipo', 'Monto'],
    ['Boletos', 'income', 120000],
    ['Audio', 'expense', 30000],
    ['Luces', 'expense', 20000],
  ]);
  (ws as any)['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Corrida');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function workbookPendones(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['DISTRIBUCIÓN PENDONES CHOLULA', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['COLOCACIÓN PENDONES', '', '', '', '', ''],
    ['EVENTO', 'AVENIDAS PRINCIPALES', 'PRIMERA PARTE', 'SEGUNDA PARTE', 'TERCERA PARTE', ''],
    ['', 'FEDERAL ATLIXCO', 10, 10, 10, ''],
    ['', 'CAMINO REAL', 8, 6, 5, ''],
    ['', 'BLVD NIÑO POBLANO', 12, 10, 10, ''],
  ]);
  (ws as any)['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 2, c: 4 } }];
  (ws as any)['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 6 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pendones');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function workbookOC(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['', '', '', '', '', 'ORDEN DE COMPRA'],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', 'CANTIDAD', 'DESCRIPCION DEL PRODUCTO', '', '', 'SUBTOTAL'],
    [1, '', 'ANTICIPO TRANSPORTE', '', '', 50000],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', 'SUBTOTAL'],
    ['', '', '', '', '', 'TOTAL'],
  ]);
  (ws as any)['!merges'] = [{ s: { r: 3, c: 2 }, e: { r: 3, c: 5 } }];
  (ws as any)['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ORDEN DE COMPRA');
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
        { id: 'pend', fileName: 'DISTRIBUCION_PENDONES.xlsx', url: '/uploads/pend.xlsx', kind: 'excel', module: 'GENERAL', createdAt: '2026-08-28T10:00:00.000Z' },
        { id: 'oc', fileName: 'ORDEN_DE_COMPRA.xlsx', url: '/uploads/oc.xlsx', kind: 'excel', module: 'GENERAL', createdAt: '2026-08-28T10:00:00.000Z' },
      ],
      tasks: [],
      sponsors: [],
    },
    '/documents/event/evt-e2e-2': [],
    '/vendor/event/evt-e2e-2': [],
  });

  await page.route('**/api/files/camp/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: workbookCampana(),
    }),
  );
  await page.route('**/api/files/corr/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: workbookCorrida(),
    }),
  );
  await page.route('**/api/files/pend/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: workbookPendones(),
    }),
  );
  await page.route('**/api/files/oc/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument-spreadsheetml.sheet',
      body: workbookOC(),
    }),
  );

  await page.goto('/events/evt-e2e-2?tab=files');
  await page.setViewportSize({ width: 1440, height: 900 });

  // Campaña visor (in-app)
  // Botón puede ser "Ver"; en algunos paneles existe "Ver / Editar"
  const campRow = page.locator('.hub-item', { hasText: 'Campaña.xlsx' }).first();
  const verBtn = campRow.getByRole('button', { name: 'Ver' }).first();
  if (await verBtn.count()) {
    await verBtn.click();
    const campRegion = page.locator('.sheet-editor').first();
    await expect(campRegion).toBeVisible();
    await campRegion.screenshot({ path: '/opt/cursor/artifacts/campana-app.png', animations: 'disabled' });
  } else {
    // Si no hay visor directo, abre editor y captura
    const editarBtn = campRow.getByRole('button', { name: /Editar|Editar aquí/ }).first();
    await editarBtn.click();
    const campRegion = page.locator('.sheet-editor').first();
    await expect(campRegion).toBeVisible();
    await campRegion.screenshot({ path: '/opt/cursor/artifacts/campana-app.png', animations: 'disabled' });
    await page.getByRole('button', { name: 'Cerrar' }).first().click();
  }

  // Corrida visor
  await page.getByRole('button', { name: 'Ver' }).nth(1).click();
  const corrRegion = page.locator('.surface .sheet-editor').nth(1);
  await expect(corrRegion).toBeVisible();
  await corrRegion.screenshot({ path: '/opt/cursor/artifacts/corrida-app.png', animations: 'disabled' });

  // Pendones visor
  await page.getByRole('button', { name: 'Ver' }).nth(2).click();
  const pendRegion = page.locator('.surface .sheet-editor').nth(2);
  await expect(pendRegion).toBeVisible();
  await pendRegion.screenshot({ path: '/opt/cursor/artifacts/pendones-app.png', animations: 'disabled' });

  // OC visor
  await page.getByRole('button', { name: 'Ver' }).nth(3).click();
  const ocRegion = page.locator('.surface .sheet-editor').nth(3);
  await expect(ocRegion).toBeVisible();
  await ocRegion.screenshot({ path: '/opt/cursor/artifacts/oc-app.png', animations: 'disabled' });

  // Editar: abrir editor y dejar celda/fórmula seleccionadas
  await page.getByRole('button', { name: 'Editar aquí' }).first().click();
  const editor = page.locator('.surface .sheet-editor').first();
  await expect(editor).toBeVisible();
  await page.getByLabel('Celda B3', { exact: true }).click();
  await page.getByLabel('Editar B3').fill('2');
  await page.getByLabel('Celda C3', { exact: true }).click();
  await page.getByLabel('Editar C3').fill('7500');
  await page.getByLabel('Celda D3', { exact: true }).click();
  await editor.screenshot({ path: '/opt/cursor/artifacts/editando.png', animations: 'disabled' });

  // Visor puro del mismo archivo
  await page.getByRole('button', { name: 'Ocultar' }).first().click();
  await page.getByRole('button', { name: 'Ver' }).first().click();
  const viewer = page.locator('.surface .sheet-editor').first();
  await expect(viewer).toBeVisible();
  await viewer.screenshot({ path: '/opt/cursor/artifacts/visor.png', animations: 'disabled' });

  // Guarda rutas de verificación en consola para el PR body (no aserciones duras)
  console.log('ARTIFACTS', [
    '/opt/cursor/artifacts/campana-app.png',
    '/opt/cursor/artifacts/corrida-app.png',
    '/opt/cursor/artifacts/pendones-app.png',
    '/opt/cursor/artifacts/oc-app.png',
    '/opt/cursor/artifacts/editando.png',
    '/opt/cursor/artifacts/visor.png',
  ]);
});

