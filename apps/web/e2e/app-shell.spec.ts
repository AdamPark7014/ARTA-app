import { expect, test } from '@playwright/test';

import { mockAuthenticatedApi, mockApi, seedSession, TEST_USER } from './support/mock-api';

/**
 * Smoke del AppShell.
 *
 * Junta 2026-08-28: el menú deja de desglosar cada check. Solo lista Dashboard,
 * las cuatro entradas de eventos y la administración; las vistas de portafolio
 * (Finanzas, Campañas, Plantillas…) solo aparecen al buscar.
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
    await expect(nav.getByRole('link', { name: 'Crear evento' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Eventos actuales' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Eventos pasados' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tareas' })).toBeVisible();
    // Las herramientas transversales quedan fuera del menú por defecto.
    await expect(nav.getByRole('link', { name: 'Finanzas' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Plantillas' })).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
    await expect(page.getByText('Ana Robles').first()).toBeVisible();
  });

  test('el buscador del sidebar alcanza las vistas de portafolio ocultas', async ({
    page,
    baseURL,
  }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    await page.goto('/dashboard');

    const nav = page.getByRole('navigation', { name: 'Módulos del panel' });
    await expect(nav.getByRole('link', { name: 'Eventos actuales' })).toBeVisible();

    await page.getByLabel('Buscar en el menú').fill('finanz');

    await expect(nav.getByRole('link', { name: 'Finanzas' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Eventos actuales' })).toHaveCount(0);
  });

  test('desde el sidebar se llega al portafolio de eventos', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    await page.goto('/dashboard');

    await page
      .getByRole('navigation', { name: 'Módulos del panel' })
      .getByRole('link', { name: 'Eventos actuales' })
      .click();

    await page.waitForURL('**/events?scope=active');
    await expect(page.getByText('Noche de Bandas').first()).toBeVisible();
    await expect(page.getByText('Festival Explanada').first()).toBeVisible();
  });

  test('un rol de convenios conserva Carpetas generales en el menú', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    // Leida / Marisol: su trabajo son carpetas y patrocinios, no la operación
    // del show. Si el menú les deja solo las cuatro entradas de eventos se
    // quedan sin su herramienta de todos los días.
    await mockAuthenticatedApi(page, {
      '/auth/me': {
        user: {
          ...TEST_USER,
          id: 'usr-e2e-conv',
          fullName: 'Leida Osorio',
          roleKey: 'convenios',
          permissions: ['checklist.edit', 'finance.view', 'campaign.view', 'folders.edit'],
        },
      },
    });

    await page.goto('/dashboard');

    const nav = page.getByRole('navigation', { name: 'Módulos del panel' });
    await expect(nav.getByRole('link', { name: 'Carpetas generales' })).toBeVisible();
    // Y sigue sin ver la administración, que no le toca
    await expect(nav.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  });

  test('«Más herramientas» abre las vistas de portafolio sin buscar', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    await page.goto('/dashboard');

    const nav = page.getByRole('navigation', { name: 'Módulos del panel' });
    await expect(nav.getByRole('link', { name: 'Finanzas' })).toHaveCount(0);

    await nav.getByRole('button', { name: /Más herramientas/ }).click();

    await expect(nav.getByRole('link', { name: 'Finanzas' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Plantillas' })).toBeVisible();
  });

  test('«Eventos pasados» deja fuera los shows que aún no ocurren', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    await page.goto('/events?scope=past');

    // Ambos fixtures tienen fecha futura y estatus abierto: el archivo va vacío.
    await expect(page.getByRole('heading', { name: 'Eventos pasados' })).toBeVisible();
    await expect(page.getByText('Noche de Bandas')).toHaveCount(0);
  });
});
