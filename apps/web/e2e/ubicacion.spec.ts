import { expect, test } from '@playwright/test';

import { mockApi, seedSession, TEST_USER } from './support/mock-api';

/** Ubicación del equipo (docs/UBICACION.md): la ven Chacho y Arturo, y dice por qué falta alguien. */
const person = (fullName: string, roleKey: string) => ({ ...TEST_USER, id: `u-${roleKey}`, fullName, roleKey, permissions: [] });

const TEAM = {
  date: '2026-11-03',
  inWindow: true,
  startHour: 10,
  endHour: 18,
  people: [
    {
      id: 'u-jp',
      fullName: 'Juan Pablo Ramírez',
      roleKey: 'compras',
      status: 'al_dia',
      count: 4,
      last: { lat: 19.04, lng: -98.2, capturedAt: '2026-11-03T18:00:00.000Z' },
    },
    { id: 'u-pau', fullName: 'Paula Farfán', roleKey: 'contabilidad', status: 'sin_permiso', count: 0, last: null },
    { id: 'u-ili', fullName: 'Iliana', roleKey: 'catering', status: 'sin_aceptar', count: 0, last: null },
  ],
};

const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Módulos del panel' });

test.describe('Ubicación del equipo', () => {
  test('Chacho ve quién está al día y por qué falta alguien', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: person('José Luis Arista', 'dir_general') }, '/ubicacion/equipo': TEAM } as never);
    await page.goto('/ubicacion');
    await expect(nav(page).getByRole('link', { name: 'Ubicación' })).toBeVisible();

    const row = (name: string) => page.locator('.geo-row', { hasText: name });
    await expect(row('Juan Pablo Ramírez')).toContainText('Al día');
    await expect(row('Paula Farfán')).toContainText('Sin permiso');
    await expect(row('Iliana')).toContainText('No ha aceptado');
  });

  test('al elegir a alguien pide su recorrido del día', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, {
      '/auth/me': { user: person('Arturo Taja', 'dir_general') },
      '/ubicacion/equipo': TEAM,
      '/ubicacion/persona/u-jp': {
        date: '2026-11-03',
        person: { id: 'u-jp', fullName: 'Juan Pablo Ramírez' },
        points: [{ id: 'p1', lat: 19.04, lng: -98.2, capturedAt: '2026-11-03T16:30:00.000Z' }],
      },
    } as never);
    await page.goto('/ubicacion');
    await page.locator('.geo-row', { hasText: 'Juan Pablo Ramírez' }).click();
    await expect(page.getByRole('link', { name: 'Abrir en Google Maps' })).toHaveAttribute('href', /19\.04,-98\.2/);
    await page.getByRole('button', { name: 'Ver a todos' }).click();
    await expect(page.getByRole('link', { name: 'Abrir en Google Maps' })).toHaveCount(0);
  });

  test('nadie más la ve: ni en el menú ni en la pantalla', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: person('Leida Osorio', 'dir_adjunta') } } as never);
    await page.goto('/ubicacion');
    await expect(page.getByText('Esta pantalla no está a tu alcance')).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Ubicación' })).toHaveCount(0);
  });

  test('el aviso de privacidad ya dice qué se registra', async ({ page }) => {
    await page.goto('/legal/privacidad');
    await expect(page.getByText(/se registra tu ubicación precisa cada media hora, de 10:00 a 18:00/)).toBeVisible();
    await expect(page.getByText('no recaba tu ubicación')).toHaveCount(0);
  });
});
