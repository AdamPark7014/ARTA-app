import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Escribir sobre el PDF del checklist.
 *
 * Los fixtures los produjo el generador REAL (`ChecklistPdfService.generate`),
 * así que este spec comprueba que los campos de captura caen encima de lo que
 * pdfkit imprimió de verdad, no sobre coordenadas inventadas. Para regenerarlos
 * cuando cambie el diseño del PDF: `fixtures/README-regenerar.ts.txt`.
 */

const FIX = join(__dirname, 'fixtures');
const pdfBytes = readFileSync(join(FIX, 'checklist-demo.pdf'));
const fieldMap = JSON.parse(readFileSync(join(FIX, 'checklist-demo.fields.json'), 'utf8'));
const dataJson = JSON.parse(readFileSync(join(FIX, 'checklist-demo.data.json'), 'utf8'));

const CHECKLIST = {
  id: 'chk-demo',
  title: 'Checklist Producción',
  progressPct: 40,
  dataJson,
  pdfUrl: '/uploads/checklists/demo-checklist.pdf',
  pdfGeneratedAt: '2026-08-29T00:00:00.000Z',
  pdfFieldsJson: fieldMap,
  template: { key: 'PRODUCCION' },
  versions: [],
};

const EVENT = {
  id: 'evt-e2e-1',
  name: 'ANDRES PARRA',
  artist: 'Andrés Parra',
  venue: 'Auditorio Arema',
  city: 'Puebla',
  status: 'ACTIVE',
  entity: 'ARTA',
  campaignType: 'INTERNAL',
  startsAt: '2026-09-20T02:00:00.000Z',
  checklists: [CHECKLIST],
  purchaseOrders: [],
  financeRuns: [],
  campaign: null,
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

async function openChecklist(page: import('@playwright/test').Page, baseURL: string) {
  await seedSession(page, baseURL);
  await mockAuthenticatedApi(page, {
    '/events/evt-e2e-1': EVENT,
    '/documents/event/evt-e2e-1': [],
    '/vendor/event/evt-e2e-1': [],
    '/checklists/chk-demo': CHECKLIST,
  });
  await page.route(/uploads\/checklists\/demo-checklist\.pdf/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: pdfBytes }),
  );
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto('/events/evt-e2e-1?tab=checklists&checklist=chk-demo');
  // El formato abre en formulario (decisión de la junta: sin overlays encima
  // de las opciones). La captura sobre la hoja es un modo que se pide.
  // `exact` porque la tarjeta «Copia anotada del PDF» también contiene «PDF».
  await page.getByRole('button', { name: 'Sobre el PDF', exact: true }).click();
  await page.locator('.pdfedit__canvas').first().waitFor({ timeout: 25000 });
}

test.describe('Checklist sobre el PDF', () => {
  test('se captura encima del documento, sin formulario aparte', async ({ page, baseURL }) => {
    await openChecklist(page, baseURL!);

    // En el modo «Sobre el PDF» se escribe encima de la hoja
    await expect(page.getByText(/Escribe directo en las cajas/i)).toBeVisible();

    // Cada campo llega con el valor vivo del checklist, encima de lo impreso
    await expect(page.getByLabel('Recinto', { exact: true })).toHaveValue('Auditorio Arema');
    await expect(page.getByLabel('Aforo autorizado', { exact: true })).toHaveValue('4200');
    await expect(page.getByLabel('Audio confirmado con proveedor', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Plano de luces recibido', { exact: true })).not.toBeChecked();

    // Se escribe directamente sobre la hoja
    await page.getByLabel('Contacto en sitio', { exact: true }).fill('Rodrigo López · 222 145 8890');
    await page.getByLabel('Plano de luces recibido', { exact: true }).check();

    await expect(page.getByLabel('Contacto en sitio', { exact: true })).toHaveValue(
      'Rodrigo López · 222 145 8890',
    );
    await expect(page.getByLabel('Plano de luces recibido', { exact: true })).toBeChecked();
  });

  test('los campos quedan dentro de la página del PDF', async ({ page, baseURL }) => {
    await openChecklist(page, baseURL!);

    const pageBox = await page.locator('.pdfedit__page').first().boundingBox();
    expect(pageBox).not.toBeNull();

    // Si el mapa de coordenadas se desalineara, algún campo se saldría de la hoja
    for (const label of ['Recinto', 'Fecha de montaje', 'Contacto en sitio', 'Aforo autorizado']) {
      const box = await page.getByLabel(label, { exact: true }).boundingBox();
      expect(box, `campo ${label}`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(pageBox!.x - 1);
      expect(box!.y).toBeGreaterThanOrEqual(pageBox!.y - 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(pageBox!.x + pageBox!.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(pageBox!.y + pageBox!.height + 1);
    }
  });

  test('se puede volver al formulario clásico', async ({ page, baseURL }) => {
    await openChecklist(page, baseURL!);

    await page.getByRole('button', { name: 'Formulario rápido' }).click();

    await expect(page.locator('.pdfedit__canvas')).toHaveCount(0);
    // El índice lateral repite el nombre de la sección: se ancla al encabezado.
    await expect(page.getByRole('heading', { name: 'Datos del show' })).toBeVisible();
  });
});
