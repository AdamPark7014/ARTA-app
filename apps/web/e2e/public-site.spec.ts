import { test, expect } from '@playwright/test';

/**
 * Estas páginas se arman en el servidor de Next: su `fetch` al API no pasa por el
 * navegador y `page.route` no lo ve. Por eso sin API solo se pide lo que el sitio
 * garantiza siempre (contenido propio, HTML desde el servidor y sin noticias
 * inventadas). La noticia real, con el API y sus datos, la prueba la corrida de
 * stack real.
 */
test.describe('Sitio público SSR', () => {
  test('/p/arta llega con contenido en el HTML, aunque el API no conteste', async ({ page, request }) => {
    // Por IP: `arta.localhost` solo lo resuelve el navegador, y a esta ruta le da igual el dominio.
    const res = await request.get(`http://127.0.0.1:${process.env.E2E_PORT || 3100}/p/arta`);
    expect(res.status()).toBeLessThan(400);
    expect(await res.text()).toMatch(/<h1[^>]*>[^<]*(experiencia|Show)/i);

    await page.goto('/p/arta');
    await expect(page.locator('h1')).toContainText(/experiencia|Show/i);
    await expect(page.getByRole('heading', { name: /Noticias/i })).toBeVisible();
    await expect(page.locator('a[href*="/p/arta/noticias/"]')).toHaveCount(0);
  });

  test('la letra es propia: el sitio no le pide nada a Google Fonts', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url());
    });
    await page.goto('/p/arta');
    await expect(page.locator('h1')).toBeVisible();
    expect(external).toEqual([]);
    expect(await page.locator('h1').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/outfit/i);
  });

  test('una noticia que no existe lo dice, no enseña una página rota', async ({ page }) => {
    await page.goto('/p/arta/noticias/no-existe');
    await expect(page.getByText('Noticia no encontrada')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver todas las noticias' })).toHaveAttribute('href', '/p/arta#noticias');
  });

  test('las páginas interiores responden aunque el API no conteste', async ({ page }) => {
    await page.goto('/p/arta/cartelera');
    await expect(page.getByRole('heading', { level: 1, name: 'Próximos shows' })).toBeVisible();

    await page.goto('/p/arta/noticias');
    await expect(page.getByRole('heading', { level: 1, name: 'Noticias' })).toBeVisible();

    await page.goto('/p/arta/cartelera/no-existe');
    await expect(page.getByText('Show no encontrado')).toBeVisible();
  });
});
