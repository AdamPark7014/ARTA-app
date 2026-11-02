import { expect, test } from '@playwright/test';

import { mockStudio, siteState } from './support/site-fixtures';

/**
 * El sitio con contenido. Las páginas públicas se arman en el servidor y `page.route` no ve su
 * `fetch`; la vista previa (`/site`) pinta las mismas páginas en el navegador, así que aquí se prueba
 * con ella. Lo que el sitio garantiza sin API está en `public-site.spec.ts`.
 */
test.describe('Sitio público · Inicio', () => {
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

  test('un botón guardado con un ancla vieja lleva a su página', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    await page.getByRole('button', { name: 'Siguiente' }).click();
    // La foto de prueba lo guardó como `#cartelera`.
    await expect(page.locator('.sa-hero').getByRole('link', { name: 'Ver cartelera' })).toHaveAttribute('href', '/p/arta/cartelera');
  });

  test('resume y lleva a cada página', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    await expect(page.getByRole('link', { name: 'Ver toda la cartelera' })).toHaveAttribute('href', '/p/arta/cartelera');
    await expect(page.getByRole('link', { name: 'Conoce a Arta' })).toHaveAttribute('href', '/p/arta/nosotros');
    await expect(page.getByRole('link', { name: 'Ver todos los servicios' })).toHaveAttribute('href', '/p/arta/servicios');
    await expect(page.getByRole('link', { name: 'Ver todas las noticias' })).toHaveAttribute('href', '/p/arta/noticias');
    await expect(page.getByRole('link', { name: 'Ver todas las historias' })).toHaveAttribute('href', '/p/arta/historias');
    await expect(page.getByRole('link', { name: 'Ver toda la galería' })).toHaveAttribute('href', '/p/arta/galeria');
    // Inicio enseña tres preguntas; la cuarta está en su página.
    await expect(page.locator('#faq details')).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Ver todas las preguntas' })).toHaveAttribute('href', '/p/arta/preguntas');
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
    await expect(page.locator('#cartelera').getByRole('link', { name: 'Escríbenos' })).toHaveAttribute('href', '/p/arta/contacto');
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

  test('la marca: tinta y papel, letra propia y fotos a color', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    const look = await page.locator('.sa').evaluate((root) => {
      const gold = /201,\s*169,\s*98/;
      const offenders = [...root.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el);
        return gold.test(s.color) || gold.test(s.backgroundColor) || gold.test(s.borderTopColor);
      });
      // Los logos de aliados y el mapa van en un tono: no son fotos.
      const gray = [...root.querySelectorAll('img, .sa-footer__mark')]
        .filter((el) => !el.closest('.sa-allies'))
        .filter((el) => getComputedStyle(el).filter.includes('grayscale'));
      return {
        offenders: offenders.length,
        gray: gray.length,
        title: getComputedStyle(root.querySelector('.sa-title') as Element).fontFamily,
        body: getComputedStyle(root).fontFamily,
      };
    });
    expect(look.offenders).toBe(0);
    expect(look.gray).toBe(0);
    expect(look.title).toMatch(/outfit/i);
    expect(look.body).toMatch(/nunito/i);
  });
});

test.describe('Sitio público · páginas', () => {
  const PAGES: Array<[string, string]> = [
    ['cartelera', 'Próximos shows'],
    ['nosotros', 'Producimos el show completo'],
    ['servicios', 'Todo lo que un show necesita'],
    ['noticias', 'Noticias'],
    ['historias', 'Detrás del show'],
    ['galeria', 'Así se vive'],
    ['preguntas', 'Preguntas frecuentes'],
    ['contacto', 'Hablemos de tu próximo show'],
  ];

  for (const [key, title] of PAGES) {
    test(`${key} es una página con su título y sus migas`, async ({ page }) => {
      await mockStudio(page, siteState());
      await page.goto(`/site?embed=1&pagina=${key}`);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Estás en' }).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/p/arta');
    });
  }

  test('el menú lleva a páginas, no a anclas, y marca dónde estás', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1&pagina=servicios');
    await expect(page.locator('h1')).toHaveText('Todo lo que un show necesita');

    const hrefs = await page.locator('.sa-nav__links a').evaluateAll((els) => els.map((e) => e.getAttribute('href') || ''));
    expect(hrefs.length).toBeGreaterThan(4);
    for (const href of hrefs) expect(href).toMatch(/^\/p\/arta\/[a-z]+$/);
    await expect(page.locator('.sa-nav__links a[aria-current="page"]')).toHaveText('Servicios');
  });

  test('el pie es el mapa del sitio', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    const map = page.getByRole('navigation', { name: 'Mapa del sitio' });
    for (const label of ['Inicio', 'Cartelera', 'Nosotros', 'Servicios', 'Noticias', 'Historias', 'Galería', 'Preguntas', 'Contacto']) {
      await expect(map.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(page.getByRole('navigation', { name: 'Servicios' }).getByRole('link', { name: 'Hospitalidad' })).toHaveAttribute(
      'href',
      '/p/arta/servicios/hospitalidad',
    );
  });

  test('se navega por el sitio sin salir de la vista previa', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1');

    await page.locator('.sa-nav__links').getByRole('link', { name: 'Servicios' }).click();
    await expect(page.locator('h1')).toHaveText('Todo lo que un show necesita');

    await page.getByRole('link', { name: /Producción/ }).first().click();
    await expect(page.locator('h1')).toHaveText('Producción');
    await expect(page.getByRole('heading', { name: 'Qué incluye' })).toBeVisible();
    await expect(page.getByText('Plantas de luz y stage hands')).toBeVisible();

    await page.getByRole('navigation', { name: 'Estás en' }).getByRole('link', { name: 'Servicios' }).click();
    await expect(page.locator('h1')).toHaveText('Todo lo que un show necesita');
    expect(new URL(page.url()).pathname).toBe('/site');
  });

  test('un servicio guardado sin detalle toma el de arranque por su nombre', async ({ page }) => {
    const state = siteState();
    state.pages.push({
      id: 'mods',
      sectionKey: 'home_modulos',
      published: true,
      contentJson: {
        headline: 'Servicios',
        tiles: [
          { title: 'Hospitalidad', body: 'Resumen guardado' },
          { title: 'Luces de colores', body: 'Uno nuevo', detail: 'Texto propio', includes: 'Una cosa\nOtra cosa' },
        ],
      },
    });
    await mockStudio(page, state);

    await page.goto('/site?embed=1&pagina=servicios&slug=hospitalidad');
    await expect(page.locator('h1')).toHaveText('Hospitalidad');
    await expect(page.getByText('Camerinos preparados')).toBeVisible();

    await page.goto('/site?embed=1&pagina=servicios&slug=luces-de-colores');
    await expect(page.getByText('Texto propio')).toBeVisible();
    await expect(page.locator('.sa-includes li')).toHaveCount(2);
  });

  test('una página quitada en Studio sale del menú y del pie', async ({ page }) => {
    const state = siteState();
    state.pages.push({
      id: 'lay',
      sectionKey: 'site_layout',
      published: true,
      contentJson: { pages: [{ key: 'inicio', visible: true }, { key: 'noticias', visible: true }, { key: 'galeria', visible: false }] },
    });
    await mockStudio(page, state);
    await page.goto('/site?embed=1&modo=publicado');
    await expect(page.locator('.sa-hero')).toBeVisible();

    const labels = await page.locator('.sa-nav__links a').allTextContents();
    expect(labels[0]).toBe('Noticias');
    expect(labels).not.toContain('Galería');
    await expect(page.getByRole('navigation', { name: 'Mapa del sitio' }).getByRole('link', { name: 'Galería' })).toHaveCount(0);
    // Tampoco en Inicio: su sección llevaría a una página que ya no existe.
    await expect(page.locator('#galeria')).toHaveCount(0);
    await expect(page.locator('a[href="/p/arta/galeria"]')).toHaveCount(0);
  });

  test('nada lleva a una página quitada', async ({ page }) => {
    const state = siteState();
    state.pages.push({
      id: 'lay',
      sectionKey: 'site_layout',
      published: true,
      contentJson: { pages: [{ key: 'cartelera', visible: false }, { key: 'servicios', visible: false }] },
    });
    await mockStudio(page, state);
    await page.goto('/site?embed=1&modo=publicado');

    // La portada no presenta shows y la foto guardada con «Ver cartelera» se queda sin ese botón.
    await expect(page.locator('h1')).toHaveText('Escenario, luz y público');
    await expect(page.locator('.sa-hero').getByRole('link', { name: 'Ver cartelera' })).toHaveCount(0);
    await expect(page.locator('.sa-hero').getByRole('link', { name: 'Contacto' })).toBeVisible();
    await expect(page.locator('a[href^="/p/arta/cartelera"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/p/arta/servicios"]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Servicios' })).toHaveCount(0);

    await page.goto('/site?embed=1&modo=publicado&pagina=nosotros');
    await expect(page.locator('h1')).toHaveText('Producimos el show completo');
    await expect(page.locator('a[href^="/p/arta/servicios"]')).toHaveCount(0);
  });

  test('Contacto no se quita aunque venga así guardado: todos los botones llevan ahí', async ({ page }) => {
    const state = siteState();
    state.pages.push({
      id: 'lay',
      sectionKey: 'site_layout',
      published: true,
      contentJson: { pages: [{ key: 'contacto', visible: false }] },
    });
    await mockStudio(page, state);
    await page.goto('/site?embed=1&modo=publicado');
    await expect(page.locator('.sa-nav').getByRole('link', { name: 'Contacto' })).toHaveAttribute('href', '/p/arta/contacto');
  });

  test('sin historias ni fotos publicadas, esas páginas no salen en el menú', async ({ page }) => {
    const state = siteState();
    state.items = state.items.filter((i) => i.kind === 'aliado');
    await mockStudio(page, state);
    await page.goto('/site?embed=1&modo=publicado');
    await expect(page.locator('.sa-hero')).toBeVisible();

    const labels = await page.locator('.sa-nav__links a').allTextContents();
    expect(labels).not.toContain('Historias');
    expect(labels).not.toContain('Galería');
    await expect(page.locator('#historias')).toHaveCount(0);
  });

  test('historias: todas a la vista y con el mismo visor', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1&pagina=historias&modo=publicado');

    await expect(page.locator('.sa-storygrid .sa-story-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Ver historia: Prueba de luces' }).click();
    await expect(page.getByRole('dialog')).toContainText('Antes de abrir.');
  });

  test('preguntas: están todas', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1&pagina=preguntas');
    await expect(page.locator('.sa-faq details')).toHaveCount(4);
  });

  test('contacto: formulario, datos y mapa en la misma página', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1&pagina=contacto');

    await expect(page.getByLabel('Tu nombre')).toBeVisible();
    await expect(page.getByText('contacto@artaproducciones.com').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dónde encontrarnos' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute('href', /google\.com\/maps/);
  });

  test('nosotros: su historia, cómo trabajan y sus aliados', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1&pagina=nosotros');

    await expect(page.getByRole('heading', { name: 'Cómo trabajamos' })).toBeVisible();
    await expect(page.locator('.sa-steps li')).toHaveCount(4);
    await expect(page.getByRole('img', { name: 'Radio 98.7' })).toBeVisible();
  });

  test('una noticia y un show tienen su detalle', async ({ page }) => {
    await mockStudio(page, siteState());
    await page.goto('/site?embed=1&pagina=noticias&slug=festival-de-verano');
    await expect(page.locator('h1')).toHaveText('Así se vivió el festival de verano');

    await page.goto('/site?embed=1&pagina=cartelera&slug=los-ecos');
    await expect(page.locator('h1')).toHaveText('Los Ecos de Cholula');
    await expect(page.getByRole('link', { name: 'Comprar boletos' })).toBeVisible();
  });

  test.describe('en el teléfono', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('el menú ocupa la pantalla, lleva a la página y no hay scroll lateral', async ({ page }) => {
      await mockStudio(page, siteState());
      await page.goto('/site?embed=1');

      await expect(page.locator('.sa-nav__links')).toBeHidden();
      await page.getByRole('button', { name: 'Abrir menú' }).click();
      const menu = page.locator('#sa-menu');
      // En el teléfono también están las que no caben en la barra de computadora.
      await expect(menu.getByRole('link', { name: 'Preguntas' })).toBeVisible();
      await menu.getByRole('link', { name: 'Cartelera' }).click();
      await expect(page.locator('h1')).toHaveText('Próximos shows');
      await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('los campos del formulario no provocan zoom en Safari', async ({ page }) => {
      await mockStudio(page, siteState());
      await page.goto('/site?embed=1&pagina=contacto');
      const size = await page.getByLabel('Tu nombre').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
    });
  });
});
