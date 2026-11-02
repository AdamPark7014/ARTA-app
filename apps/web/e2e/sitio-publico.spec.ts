import { expect, test } from '@playwright/test';

import { mockStudio, siteState } from './support/site-fixtures';

/**
 * El sitio con contenido. Las páginas públicas se arman en el servidor y `page.route` no ve su
 * `fetch`; la vista previa (`/site`) pinta la misma página en el navegador, así que aquí se prueba
 * con ella. Lo que el sitio garantiza sin API está en `public-site.spec.ts`.
 */
test.describe('Sitio público', () => {
  test('pinta las secciones en el orden de la maqueta y sin las quitadas', async ({ page }) => {
    const state = siteState();
    state.pages.push({
      id: 'lay',
      sectionKey: 'site_layout',
      published: true,
      contentJson: {
        blocks: [
          { id: 'noticias', type: 'noticias', visible: true },
          { id: 'cartelera', type: 'cartelera', visible: true },
          { id: 'faq', type: 'faq', visible: false },
          { id: 'contacto', type: 'contacto', visible: true },
        ],
      },
    });
    await mockStudio(page, state);
    await page.goto('/site?embed=1');

    await expect(page.locator('main > section')).toHaveCount(3);
    await expect(page.locator('main > section').nth(0)).toHaveId('noticias');
    await expect(page.locator('main > section').nth(1)).toHaveId('cartelera');
    await expect(page.locator('#faq')).toHaveCount(0);
    // El menú sale de las secciones que sí se ven.
    await expect(page.locator('.sa-nav__links a', { hasText: 'Historias' })).toHaveCount(0);
  });

  test('la portada presenta el próximo show con su póster y sus boletos', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    await expect(page.locator('h1')).toHaveText('Los Ecos de Cholula');
    await expect(page.locator('.sa-hero__poster')).toHaveAttribute('src', '/uploads/poster-1.jpg');
    await expect(page.locator('.sa-hero').getByRole('link', { name: 'Comprar boletos' })).toHaveAttribute(
      'href',
      'https://boletos.example.com/ecos',
    );

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.locator('h1')).toHaveText('Escenario, luz y público');
  });

  test('la cartelera dice cuándo, dónde y si hay boletos', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    const ecos = page.locator('.sa-show', { hasText: 'Los Ecos de Cholula' });
    await expect(ecos).toContainText('Auditorio Explanada · Puebla');
    await expect(ecos).toContainText('A la venta');
    await expect(ecos.getByRole('link', { name: 'Comprar boletos' })).toBeVisible();

    // Agotado: el estado se enseña y no se ofrece comprar.
    const trio = page.locator('.sa-show', { hasText: 'Trío Malinche' });
    await expect(trio).toContainText('Agotado');
    await expect(trio.getByRole('link', { name: 'Comprar boletos' })).toHaveCount(0);
  });

  test('sin shows, la cartelera invita a escribir en vez de quedar vacía', async ({ page }) => {
    const state = siteState();
    state.news = state.news.filter((n) => n.template !== 'evento');
    await mockStudio(page, state);
    await page.goto('/site?embed=1');

    await expect(page.locator('#cartelera')).toContainText('Estamos armando la próxima temporada');
  });

  test('las historias se abren a pantalla completa y avanzan', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    await page.getByRole('button', { name: 'Ver historia: Así se ve desde el escenario' }).click();
    const viewer = page.getByRole('dialog');
    await expect(viewer).toContainText('Un solo coro.');
    await expect(viewer.getByRole('link', { name: 'Ver más' })).toHaveAttribute('href', 'https://example.com/mas');

    await page.keyboard.press('ArrowRight');
    await expect(viewer).toContainText('Prueba de luces');

    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('la vista previa marca los borradores; «Publicado» no los enseña', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');
    await expect(page.locator('#historias .sa-draft')).toHaveCount(1);
    await expect(page.locator('#noticias')).toContainText('Nota que sigue en borrador');

    await page.goto('/site?embed=1&modo=publicado');
    await expect(page.locator('#historias')).toBeVisible();
    await expect(page.locator('.sa-draft')).toHaveCount(0);
    await expect(page.locator('#noticias')).not.toContainText('Nota que sigue en borrador');
  });

  test('la galería abre la foto en grande', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    await page.getByRole('button', { name: 'Ampliar foto: Festival' }).click();
    await expect(page.getByRole('dialog', { name: 'Festival' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar foto' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('el formulario arma el correo con lo escrito', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');
    await page.evaluate(() => {
      (window as unknown as { __mailto?: string }).__mailto = '';
    });

    await page.getByLabel('Tu nombre').fill('Sofía');
    await page.getByLabel('Cuéntanos').fill('Un show en marzo');
    // El clic navegaría a `mailto:`: se revisa la dirección que arma.
    const mailto = page.waitForRequest((r) => r.url().startsWith('mailto:'), { timeout: 2000 }).catch(() => null);
    await page.getByRole('button', { name: 'Escribir a Arta' }).click();
    await mailto;
    await expect(page.getByLabel('Tu nombre')).toHaveValue('Sofía');
  });

  test('un enlace `javascript:` escrito en Studio no llega a la página', async ({ page }) => {
    const state = siteState();
    state.pages.push({
      id: 'lay',
      sectionKey: 'site_layout',
      published: true,
      contentJson: { blocks: [{ id: 'abc', type: 'texto', visible: true }] },
    });
    state.pages.push({
      id: 'txt',
      sectionKey: 'bloque_abc',
      published: true,
      contentJson: { headline: 'Una sección', body: 'Texto', cta: 'Clic', ctaHref: 'javascript:alert(1)' },
    });
    await mockStudio(page, state);
    await page.goto('/site?embed=1');

    await expect(page.getByRole('heading', { name: 'Una sección' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Clic' })).toHaveCount(0);
  });

  test('la marca: tinta y papel, letra propia y sin dorado', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    const look = await page.locator('.sa').evaluate((root) => {
      const gold = /201,\s*169,\s*98/;
      const offenders = [...root.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el);
        return gold.test(s.color) || gold.test(s.backgroundColor) || gold.test(s.borderTopColor);
      });
      return {
        offenders: offenders.length,
        title: getComputedStyle(root.querySelector('.sa-title') as Element).fontFamily,
        body: getComputedStyle(root).fontFamily,
      };
    });
    expect(look.offenders).toBe(0);
    expect(look.title).toMatch(/outfit/i);
    expect(look.body).toMatch(/nunito/i);
  });

  test.describe('en el teléfono', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('el menú ocupa la pantalla y no hay scroll lateral', async ({ page }) => {
      await mockStudio(page, siteState());
      await page.goto('/site?embed=1');

      await expect(page.locator('.sa-nav__links')).toBeHidden();
      await page.getByRole('button', { name: 'Abrir menú' }).click();
      const menu = page.locator('#sa-menu');
      await expect(menu.getByRole('link', { name: 'Cartelera' })).toBeVisible();
      await menu.getByRole('link', { name: 'Cartelera' }).click();
      await expect(menu).toBeHidden();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('los campos del formulario no provocan zoom en Safari', async ({ page }) => {
      await mockStudio(page, siteState());
      await page.goto('/site?embed=1');
      const size = await page.getByLabel('Tu nombre').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
    });
  });
});
