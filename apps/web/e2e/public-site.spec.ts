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
      // El mapa de la ubicación es un iframe de Google y trae su propia letra: eso no cuenta.
      if (r.frame() === page.mainFrame() && /fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url());
    });
    await page.goto('/p/arta');
    await expect(page.locator('h1')).toBeVisible();
    expect(external).toEqual([]);
    expect(await page.locator('h1').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/outfit/i);
  });

  test('una noticia que no existe lo dice, no enseña una página rota', async ({ page }) => {
    await page.goto('/p/arta/noticias/no-existe');
    await expect(page.getByText('Noticia no encontrada')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver todas las noticias' })).toHaveAttribute('href', '/p/arta/noticias');
  });

  // Sin API también: el sitio siempre tiene su texto de arranque.
  const PAGES: Array<[string, string, RegExp]> = [
    ['/p/arta/cartelera', 'Próximos shows', /Cartelera/],
    ['/p/arta/nosotros', 'Producimos el show completo', /Nosotros/],
    ['/p/arta/servicios', 'Todo lo que un show necesita', /Servicios/],
    ['/p/arta/servicios/produccion', 'Producción', /Producción/],
    ['/p/arta/noticias', 'Noticias', /Noticias/],
    ['/p/arta/historias', 'Detrás del show', /Historias/],
    ['/p/arta/galeria', 'Así se vive', /Galería/],
    ['/p/arta/preguntas', 'Preguntas frecuentes', /Preguntas/],
    ['/p/arta/contacto', 'Hablemos de tu próximo show', /Contacto/],
  ];

  for (const [path, heading, title] of PAGES) {
    test(`${path} tiene su página, su título y su descripción`, async ({ page, request }) => {
      const res = await request.get(`http://127.0.0.1:${process.env.E2E_PORT || 3100}${path}`);
      expect(res.status()).toBe(200);
      const html = await res.text();
      // Lo que ve Google llega en el HTML, sin esperar al navegador.
      expect(html).toContain(heading);
      expect(html).toMatch(/<meta name="description" content="[^"]{10,}/);

      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page).toHaveTitle(title);
    });
  }

  test('lo que no existe lo dice, no enseña una página rota', async ({ page }) => {
    await page.goto('/p/arta/servicios/no-existe');
    await expect(page.getByText('Servicio no encontrado')).toBeVisible();
    await page.goto('/p/arta/cartelera/no-existe');
    await expect(page.getByText('Show no encontrado')).toBeVisible();
  });

  test('el menú lleva a páginas y navegar no recarga todo', async ({ page }) => {
    await page.goto('/p/arta');
    await page.locator('.sa-nav__links').getByRole('link', { name: 'Nosotros' }).click();
    await expect(page).toHaveURL(/\/p\/arta\/nosotros$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Producimos el show completo');
    await expect(page.locator('.sa-nav__links a[aria-current="page"]')).toHaveText('Nosotros');
  });

  const OLD_ANCHORS: Array<[string, string]> = [
    ['noticias', '/p/arta/noticias'],
    ['cartelera', '/p/arta/cartelera'],
    ['modulos', '/p/arta/servicios'],
    ['faq', '/p/arta/preguntas'],
    ['ubicacion', '/p/arta/contacto'],
    ['contacto', '/p/arta/contacto'],
  ];

  for (const [anchor, target] of OLD_ANCHORS) {
    test(`la liga vieja #${anchor} lleva a su página`, async ({ page }) => {
      await page.goto(`/p/arta#${anchor}`);
      await page.waitForURL((url) => url.pathname === target);
    });
  }

  test('el sitemap trae todas las páginas', async ({ request }) => {
    const xml = await (await request.get(`http://127.0.0.1:${process.env.E2E_PORT || 3100}/sitemap.xml`)).text();
    for (const path of ['/p/arta/cartelera', '/p/arta/nosotros', '/p/arta/servicios/produccion', '/p/arta/noticias', '/p/arta/preguntas', '/p/arta/contacto']) {
      expect(xml).toContain(path);
    }
    // Sin contenido no se le ofrecen a Google: están vacías y no salen en el menú.
    expect(xml).not.toContain('/p/arta/historias');
    expect(xml).not.toContain('/p/arta/galeria');
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
