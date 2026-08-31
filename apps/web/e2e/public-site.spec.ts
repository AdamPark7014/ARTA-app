import { test, expect } from '@playwright/test';
import type { Route } from '@playwright/test';

const STUDIO_MOCK = {
  pages: [
    {
      sectionKey: 'home_hero',
      contentJson: { headline: 'La experiencia del Show', sub: 'Producción en Puebla' },
    },
  ],
  slides: [
    {
      id: 's1',
      title: 'Show en vivo',
      subtitle: 'Arta Producciones',
      imageUrl: '/uploads/seed-hero-1.jpg',
      ctaLabel: 'Explorar',
      ctaHref: '#modulos',
    },
  ],
  news: [
    {
      id: 'n1',
      slug: 'temporada-puebla',
      title: 'Nueva temporada de shows en Puebla',
      excerpt: 'Producción integral.',
      coverUrl: '/uploads/seed-news-1.jpg',
      publishedAt: '2026-01-15T12:00:00.000Z',
    },
  ],
};

const NEWS_MOCK = {
  id: 'n1',
  slug: 'temporada-puebla',
  title: 'Nueva temporada de shows en Puebla',
  excerpt: 'Producción integral de conciertos.',
  body: 'Arta Producciones anuncia la nueva temporada con shows en Puebla.',
  coverUrl: '/uploads/seed-news-1.jpg',
  publishedAt: '2026-01-15T12:00:00.000Z',
};

test.describe('Sitio público SSR', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/studio/public/ARTA', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUDIO_MOCK) }),
    );
    await page.route('**/studio/public/news/temporada-puebla', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NEWS_MOCK) }),
    );
  });

  test('/p/arta renderiza contenido en HTML (no vacío)', async ({ page }) => {
    const res = await page.goto('/p/arta');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('h1')).toContainText(/experiencia|Show/i);
    await expect(page.getByRole('heading', { name: /Noticias/i })).toBeVisible();
    await expect(page.getByText('Nueva temporada de shows en Puebla')).toBeVisible();
  });

  test('noticia por slug renderiza cuerpo server-side', async ({ page }) => {
    await page.goto('/p/arta/noticias/temporada-puebla');
    await expect(page.locator('h1')).toContainText('Nueva temporada de shows en Puebla');
    await expect(page.getByText(/anuncia la nueva temporada/i)).toBeVisible();
  });
});
