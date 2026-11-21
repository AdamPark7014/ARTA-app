import { expect, test } from '@playwright/test';

import { FORMAT_STUBS, FORMAT_URL } from './support/format-fixture';
import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Ver y editar en grande, y menú que se esconde.
 *
 * Pedido de Adam (29-08-2026): que lo que se edita se vea en grande y no en
 * chiquito, y que el menú lateral se despliegue al acercar el cursor al borde
 * izquierdo, como en Mac.
 */

test.describe('Ver en grande', () => {
  test('el formato se agranda al pedir pantalla completa', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, FORMAT_STUBS);
    await page.setViewportSize({ width: 1500, height: 1000 });

    await page.goto(FORMAT_URL);
    const hoja = page.locator('.fsheet');
    await hoja.waitFor({ timeout: 25000 });
    await expect.poll(async () => (await hoja.boundingBox())?.width ?? 0, { timeout: 15000 }).toBeGreaterThan(0);

    // El documento abre en línea; «Ampliar» lo lleva a toda la ventana.
    await expect(page.getByRole('button', { name: /Ampliar a pantalla completa/ })).toBeVisible();
    await page.getByRole('button', { name: /Ampliar a pantalla completa/ }).first().click();
    await expect(page.getByRole('button', { name: /Salir de pantalla completa/ })).toBeVisible();
    await expect(page.locator('.expandbox--full')).toHaveCount(1);

    // La hoja sigue siendo la misma, con sus datos, y queda dentro de la ventana.
    await expect(hoja.getByLabel('Venue', { exact: true })).toHaveValue('Auditorio Arema');
    const box = (await hoja.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

    await page.keyboard.press('Escape');
    await expect(page.locator('.expandbox--full')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Ampliar a pantalla completa/ })).toBeVisible();
  });
});
