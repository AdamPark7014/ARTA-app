import { expect, test } from '@playwright/test';

import { mockAuthenticatedApi, mockApi, seedSession } from './support/mock-api';

/**
 * Smoke del AppShell — el área que concentra el rediseño de UI de la Fase A
 * (sidebar con buscador de módulos, tab bar del hub de evento, risk badges).
 */
test.describe('App shell', () => {
  test('sin sesión el middleware devuelve a /login conservando el destino', async ({ page }) => {
    await mockApi(page);

    await page.goto('/dashboard');

    const url = new URL(page.url());
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe('/dashboard');
  });

  test('con sesión renderiza navegación, identidad y dashboard', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    await page.goto('/dashboard');

    const nav = page.getByRole('navigation', { name: 'Módulos del panel' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Eventos' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Finanzas' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
    await expect(page.getByText('Ana Robles').first()).toBeVisible();
  });

  test('el buscador del sidebar filtra los módulos', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    await page.goto('/dashboard');

    const nav = page.getByRole('navigation', { name: 'Módulos del panel' });
    await expect(nav.getByRole('link', { name: 'Eventos' })).toBeVisible();

    await page.getByLabel('Buscar en el menú').fill('finanz');

    await expect(nav.getByRole('link', { name: 'Finanzas' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Eventos' })).toHaveCount(0);
  });

  test('desde el sidebar se llega al portafolio de eventos', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    await page.goto('/dashboard');

    await page
      .getByRole('navigation', { name: 'Módulos del panel' })
      .getByRole('link', { name: 'Eventos' })
      .click();

    await page.waitForURL('**/events');
    await expect(page.getByText('Noche de Bandas').first()).toBeVisible();
    await expect(page.getByText('Festival Explanada').first()).toBeVisible();
  });
});
