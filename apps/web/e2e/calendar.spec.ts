import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

test.describe('Calendario de eventos', () => {
  test('nav + mes renderizan shows con startsAt', async ({ page, baseURL, isMobile }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    if (isMobile) {
      // En teléfono el menú es un cajón: lo prueba mobile-shell.spec.ts.
      await page.goto('/calendar');
    } else {
      await page.goto('/dashboard');
      const nav = page.getByRole('navigation', { name: 'Módulos del panel' });
      await expect(nav.getByRole('link', { name: 'Calendario' })).toBeVisible();
      await nav.getByRole('link', { name: 'Calendario' }).click();
      await page.waitForURL('**/calendar');
    }

    await expect(page.getByRole('heading', { name: 'Calendario', level: 2 })).toBeVisible();

    // «Noche de Bandas» es de septiembre de 2026 (startsAt 2026-09-20T02:00Z, la
    // noche del 19 en Puebla) y el calendario abre en el mes de hoy: se camina
    // hasta ahí en la dirección que toque, sea cual sea la fecha de la corrida.
    const now = new Date();
    const months = (2026 - now.getFullYear()) * 12 + (8 - now.getMonth());
    const step = page.getByRole('button', { name: months < 0 ? 'Mes anterior' : 'Mes siguiente' });
    for (let i = 0; i < Math.abs(months); i += 1) await step.click();

    await expect(page.getByRole('heading', { name: /septiembre de 2026/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Noche de Bandas' })).toHaveAttribute('href', '/events/evt-e2e-1');
  });
});

test.describe('Sitio público sin noticias inventadas', () => {
  test('/p/arta con news vacía muestra empty state (no slugs fake)', async ({ page }) => {
    await page.route('**/studio/public/ARTA', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pages: [
            {
              sectionKey: 'home_hero',
              contentJson: { headline: 'La experiencia del Show', sub: 'Producción en Puebla' },
            },
          ],
          slides: [],
          news: [],
        }),
      }),
    );

    await page.goto('/p/arta');
    await expect(page.getByRole('heading', { name: /Noticias/i })).toBeVisible();
    await expect(page.getByText(/Pronto publicaremos novedades/i)).toBeVisible();
    await expect(page.locator('a[href*="/p/arta/noticias/"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Preguntas frecuentes/i })).toBeVisible();
  });
});
