import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

test.describe('Calendario de eventos', () => {
  test('nav + mes renderizan shows con startsAt', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);

    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Módulos del panel' });
    await expect(nav.getByRole('link', { name: 'Calendario' })).toBeVisible();
    await nav.getByRole('link', { name: 'Calendario' }).click();
    await page.waitForURL('**/calendar');

    await expect(page.getByRole('heading', { name: /Calendario de eventos/i })).toBeVisible();
    await expect(page.getByRole('grid', { name: /Calendario/i })).toBeVisible();

    // September 2026 has "Noche de Bandas" (startsAt 2026-09-20)
    const next = page.getByRole('button', { name: 'Mes →' });
    // Cursor starts at "today" (Aug 31 2026 in CI clock may vary) — jump until we see Bandas or hit a few months
    for (let i = 0; i < 4; i++) {
      const hit = page.getByRole('button').filter({ hasText: 'Noche de Bandas' });
      if ((await hit.count()) > 0) {
        await hit.first().click();
        await expect(page.getByRole('link', { name: /Noche de Bandas/i })).toBeVisible();
        return;
      }
      await next.click();
    }
    throw new Error('Noche de Bandas no apareció en el calendario');
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
