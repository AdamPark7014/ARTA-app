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

test.describe('Ver en grande y menú automático', () => {
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

  test('el menú se esconde y vuelve al acercar el cursor al borde', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);
    await page.setViewportSize({ width: 1500, height: 1000 });

    await page.goto('/dashboard');
    await page.waitForSelector('nav[aria-label="Módulos del panel"]');

    // El pie del menú (rediseño 15-09) lo etiqueta «Esconder el menú».
    await page.getByRole('button', { name: /Esconder el menú/ }).click();
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
