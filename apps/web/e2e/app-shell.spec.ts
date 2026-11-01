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
  // El evento de prueba es del 20-09-2026: con el reloj real ya sería pasado.
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00-06:00'));
  });

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
    await expect(nav.getByRole('link', { name: 'Inicio' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Crear evento' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Eventos actuales' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Eventos pasados' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tareas' })).toBeVisible();
    // Las herramientas transversales quedan fuera del menú por defecto.
    await expect(nav.getByRole('link', { name: 'Finanzas' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Plantillas' })).toHaveCount(0);

    await expect(page.getByRole('heading', { name: /^Buen(os|as) (días|tardes|noches), Ana$/ })).toBeVisible();
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

    await page.getByLabel('Buscar en ARTA').fill('finanz');

    const results = page.getByRole('listbox', { name: 'Resultados' });
    await expect(results.getByRole('option', { name: /Finanzas/ })).toBeVisible();
    // El menú no se mueve mientras se busca.
    await expect(nav.getByRole('link', { name: 'Eventos actuales' })).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/finance/);
  });

  test('desde el sidebar se llega al portafolio de eventos', async ({ page, baseURL, isMobile }) => {
    // En teléfono el menú es un cajón: lo prueba mobile-shell.spec.ts.
    test.skip(isMobile, 'barra lateral de escritorio');
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

  test('«Más herramientas» abre las vistas de portafolio sin buscar', async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, 'barra lateral de escritorio');
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
    await expect(page.getByRole('heading', { name: 'Eventos pasados' }).first()).toBeVisible();
    await expect(page.getByText('Noche de Bandas')).toHaveCount(0);
  });

  test('el buscador encuentra eventos y personas sin acentos, y lleva a ellos', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events': [
        { id: 'evt-a', name: 'Gira Sinfónica', venue: 'Auditorio Arema', startsAt: '2030-01-10T02:00:00.000Z', status: 'ACTIVE' },
        { id: 'evt-b', name: 'Noche de Bandas', venue: 'Teatro', startsAt: '2030-02-10T02:00:00.000Z', status: 'ACTIVE' },
      ],
      '/users/directory': [{ id: 'usr-beto', fullName: 'Beto Sandoval', title: 'Logística' }],
    });
    await page.goto('/dashboard');

    const search = page.getByLabel('Buscar en ARTA');
    const results = page.getByRole('listbox', { name: 'Resultados' });

    // Antes de teclear: lo que viene.
    await search.click();
    await expect(results.getByText('Próximos eventos')).toBeVisible();
    await expect(results.getByRole('option', { name: /Noche de Bandas/ })).toBeVisible();

    await search.fill('sinfonica');
    await expect(results.getByRole('option', { name: /Gira Sinfónica/ })).toBeVisible();
    await expect(results.getByRole('option', { name: /Noche de Bandas/ })).toHaveCount(0);

    await search.fill('beto');
    await results.getByRole('option', { name: /Beto Sandoval/ }).click();
    await expect(page).toHaveURL(/\/chat\?with=usr-beto/);
  });
});
