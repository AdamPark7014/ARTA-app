import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Ver y editar en grande, y menú que se esconde.
 *
 * Pedido de Adam (29-08-2026): que lo que se edita se vea en grande y no en
 * chiquito, y que el menú lateral se despliegue al acercar el cursor al borde
 * izquierdo, como en Mac.
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

test.describe('Ver en grande y menú automático', () => {
  test('el formato se agranda al pedir pantalla completa', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': EVENT,
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
      '/checklists/chk-demo': CHECKLIST,
    });
    await page.route(/uploads\/checklists\/demo-checklist\.pdf/, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/pdf', body: pdfBytes }),
    );
    await page.setViewportSize({ width: 1500, height: 1000 });

    await page.goto('/events/evt-e2e-1?tab=checklists&checklist=chk-demo');
    await page.getByRole('button', { name: 'Sobre el PDF' }).click();
    await page.locator('.pdfedit__canvas').first().waitFor({ timeout: 25000 });

    /*
     * El canvas aparece antes de que la hoja tenga tamaño: medir aquí sin
     * esperar daba `boundingBox()` nulo y el test reventaba bajo carga, no por
     * un fallo del producto. Se espera a que la página tenga ancho real.
     */
    const hoja = page.locator('.pdfedit__page').first();
    await expect.poll(async () => (await hoja.boundingBox())?.width ?? 0, { timeout: 15000 }).toBeGreaterThan(0);
    const antes = (await hoja.boundingBox())!.width;

    await page.getByRole('button', { name: 'Ampliar' }).first().click();
    // El PDF se vuelve a rasterizar al ancho nuevo
    await expect
      .poll(async () => (await hoja.boundingBox())?.width ?? 0, { timeout: 15000 })
      .toBeGreaterThan(antes + 200);

    // Y los campos siguen cuadrando sobre el documento ya grande
    await expect(page.getByLabel('Recinto', { exact: true })).toHaveValue('Auditorio Arema');
    const pageBox = (await hoja.boundingBox())!;
    const campo = (await page.getByLabel('Aforo autorizado', { exact: true }).boundingBox())!;
    expect(campo.x).toBeGreaterThanOrEqual(pageBox.x - 1);
    expect(campo.x + campo.width).toBeLessThanOrEqual(pageBox.x + pageBox.width + 1);

    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await hoja.boundingBox())?.width ?? Number.MAX_SAFE_INTEGER, { timeout: 15000 })
      .toBeLessThan(antes + 200);
  });

  test('el menú se esconde y vuelve al acercar el cursor al borde', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);
    await page.setViewportSize({ width: 1500, height: 1000 });

    await page.goto('/dashboard');
    await page.waitForSelector('nav[aria-label="Módulos del panel"]');

    await page.getByRole('button', { name: /Esconder menú/ }).click();
    // El clic deja el cursor y el foco en el propio menú, y mientras esté
    // encima no se esconde — que es lo correcto. Hay que apartarse.
    await page.mouse.move(1000, 500);

    const sidebar = page.locator('aside.sidebar');
    await expect.poll(async () => (await sidebar.boundingBox())!.x).toBeLessThan(-100);

    // El contenido ocupa todo el ancho, no se queda en una columna
    const main = (await page.locator('.main').boundingBox())!;
    expect(main.width).toBeGreaterThan(1400);

    // Acercar el cursor al borde izquierdo lo trae de vuelta
    await page.mouse.move(4, 500);
    await expect.poll(async () => (await sidebar.boundingBox())!.x).toBeGreaterThanOrEqual(-2);

    // Y sigue siendo navegable
    await expect(sidebar.getByRole('link', { name: 'Eventos actuales' })).toBeVisible();
  });
});
