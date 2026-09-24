import { test } from '@playwright/test';

import { FORMAT_STUBS, FORMAT_URL } from './support/format-fixture';
import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/** Temporal: captura de la vista «Documento» con texto largo. No se versiona. */
test('captura del documento', async ({ page, baseURL }) => {
  await seedSession(page, baseURL!);
  await mockAuthenticatedApi(page, FORMAT_STUBS);
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto(FORMAT_URL);
  const sheet = page.locator('.fsheet');
  await sheet.waitFor({ timeout: 25000 });
  await sheet
    .getByLabel('Nombre y contacto del enlace con el hotel', { exact: true })
    .fill('Ana Rivera, gerente de grupos · 222 555 0101 · ana.rivera@cartesiano.mx · confirma late check-out para el artista y su equipo, y desayuno buffet desde las 6:30');
  await sheet.getByLabel('Nombre del hotel', { exact: true }).fill('Hotel Cartesiano');
  await page.getByRole('tab', { name: 'Lista', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/.output/shot-lista.png', fullPage: false });
  await page.getByRole('tab', { name: 'Documento', exact: true }).click();
  await sheet.waitFor({ timeout: 10000 });
  await sheet.screenshot({ path: 'e2e/.output/shot-sheet.png' });
});
