import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/** «Correcciones Dashboard — 30 de septiembre 2026» (PDF del cliente). */
test.describe('Correcciones 30-09', () => {
  test('crear evento: un horario por función y sin «Horario · cierra»', async ({ page, baseURL }) => {
    const posted: Array<Record<string, unknown>> = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events': (route: Route) => {
        if (route.request().method() === 'POST') {
          posted.push(JSON.parse(route.request().postData() || '{}'));
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'ev-0930' }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      },
    });

    await page.goto('/events/new');
    await expect(page.getByText('Horario · cierra')).toHaveCount(0);

    await page.getByPlaceholder('Artista o nombre del show').fill('La leyenda de la Nahuala');
    await page.getByLabel('Fecha del evento').fill('2026-11-08');
    await expect(page.getByLabel('Horario', { exact: true })).toBeVisible();

    await page.getByLabel('Funciones').fill('2');
    await page.getByLabel('Horario de la función 1').fill('16:00');
    await page.getByLabel('Horario de la función 2').fill('20:00');
    await page.getByRole('button', { name: 'Crear evento' }).click();

    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toMatchObject({
      name: 'La leyenda de la Nahuala',
      functions: 2,
      schedule: 'Función 1 — 16:00 · Función 2 — 20:00',
    });
  });

  test('campaña: insertar una fila mueve el TOTAL entero y su suma sigue cuadrando', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);
    await page.goto('/dev/sheet-harness?name=CAMPANA_BASE.xlsx&variant=campaign');
    const cell = (ref: string) => page.getByLabel(`Celda ${ref}`, { exact: true });
    await expect(cell('A32')).toHaveValue('TOTAL');
    const total = await cell('C32').inputValue();

    await cell('A9').click();
    await cell('A9').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Insertar fila arriba' }).click();

    await expect(cell('A9')).toHaveValue('');
    await expect(cell('A33')).toHaveValue('TOTAL');
    await expect(cell('C33')).toHaveValue(total);

    // Clic y escribir reemplaza, como en Excel; la fila nueva entra en la suma.
    await cell('D9').click();
    await page.keyboard.type('700');
    await page.keyboard.press('Enter');
    await expect(cell('D10')).toBeFocused();
    await expect(cell('C33')).not.toHaveValue(total);

    // Ctrl+Z dos veces: se va el 700 y luego la fila.
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect(cell('A32')).toHaveValue('TOTAL');
    await expect(cell('C32')).toHaveValue(total);
  });
});
