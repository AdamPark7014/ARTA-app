import { expect, test } from '@playwright/test';

import { FORMAT_STUBS, FORMAT_URL } from './support/format-fixture';
import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * El formato se ve y se llena como documento (la hoja con la marca), no como
 * formulario aparte ni escribiendo encima de un PDF. El PDF es la salida.
 */

async function openChecklist(page: import('@playwright/test').Page, baseURL: string) {
  await seedSession(page, baseURL);
  await mockAuthenticatedApi(page, FORMAT_STUBS);
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto(FORMAT_URL);
  await page.locator('.fsheet').waitFor({ timeout: 25000 });
}

test.describe('Formato como documento', () => {
  test('abre como hoja con la marca y los datos del show ya puestos', async ({ page, baseURL }) => {
    await openChecklist(page, baseURL!);

    const sheet = page.locator('.fsheet');
    await expect(sheet.getByRole('heading', { name: 'Checklist Hospedaje' })).toBeVisible();
    await expect(sheet.getByAltText('Arta Producciones')).toBeVisible();
    await expect(sheet.getByLabel('Nombre del show', { exact: true })).toHaveValue('ANDRES PARRA');
    await expect(sheet.getByLabel('Venue', { exact: true })).toHaveValue('Auditorio Arema');
    // Nada de PDF impreso debajo de la captura.
    await expect(page.locator('.pdfedit__canvas')).toHaveCount(0);
  });

  test('se llena en sitio: texto, SÍ/NO, casilla y tabla', async ({ page, baseURL }) => {
    await openChecklist(page, baseURL!);
    const sheet = page.locator('.fsheet');

    await sheet.getByLabel('Nombre del hotel', { exact: true }).fill('Hotel Cartesiano');
    await expect(sheet.getByLabel('Nombre del hotel', { exact: true })).toHaveValue('Hotel Cartesiano');

    await sheet.getByLabel('Incluye desayuno: Sí', { exact: true }).check();
    await expect(sheet.getByLabel('Incluye desayuno: Sí', { exact: true })).toBeChecked();
    await expect(sheet.getByLabel('Incluye desayuno: No', { exact: true })).not.toBeChecked();

    const late = sheet.getByLabel('Late check-out pedido', { exact: true });
    await expect(late).not.toBeChecked();
    await late.check();
    await expect(late).toBeChecked();

    await sheet.getByLabel('Nombre, renglón 1', { exact: true }).fill('Ana Rivera');
    await sheet.getByLabel('Habitación, renglón 1', { exact: true }).fill('101');
    // Al escribir aparece un renglón nuevo en blanco.
    await expect(sheet.getByLabel('Nombre, renglón 2', { exact: true })).toBeVisible();
  });

  test('la lista compacta sigue disponible como segundo modo', async ({ page, baseURL }) => {
    await openChecklist(page, baseURL!);

    await page.getByRole('tab', { name: 'Lista', exact: true }).click();
    await expect(page.locator('.fsheet')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Hotel' })).toBeVisible();

    await page.getByRole('tab', { name: 'Documento', exact: true }).click();
    await expect(page.locator('.fsheet')).toBeVisible();
  });
});
