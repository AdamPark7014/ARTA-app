import { expect, test, type Page } from '@playwright/test';

import { mockStudio, PRACTICANTE_USER, siteState, type StudioState } from './support/site-fixtures';

/**
 * Studio: todo el sitio en manos de quien no programa (pedido de Adam, 01-11-2026: «que los
 * practicantes puedan subir, quitar, bajar y poner historias, noticias, todo»), página por página.
 */

const PIXEL_PNG = {
  name: 'foto.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
};

async function open(page: Page, bloque = '') {
  await page.goto(`/studio${bloque ? `?bloque=${bloque}` : ''}`);
  await expect(page.locator('.st-outline')).toBeVisible();
}

const lastCall = (state: StudioState, path: string) => [...state.calls].reverse().find((c) => c.path === path);
const previewFrame = (page: Page) => page.frameLocator('iframe[title="Vista previa del sitio"]');
const PUBLISHED = 'Publicado. Ya se ve en el sitio.';

test.describe('Studio · quien publica', () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test('el encabezado lleva a los perfiles de practicante', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page);
    await expect(page.getByRole('link', { name: 'Perfiles de practicante' })).toHaveAttribute('href', '/studio/practicantes');
  });

  test('la lista enseña las páginas del sitio y lo que tiene cada una', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page);

    const names = await page.locator('.st-outline .st-block__main strong').allTextContents();
    expect(names).toEqual(['Inicio', 'Cartelera', 'Nosotros', 'Servicios', 'Noticias', 'Historias', 'Galería', 'Preguntas', 'Contacto', 'Datos del sitio']);
    const outline = page.locator('.st-outline');
    await expect(outline).toContainText('2 shows');
    await expect(outline).toContainText('3 historias · 1 sin publicar');
    await expect(outline).toContainText('4 servicios');
    await expect(outline).toContainText('4 preguntas');
  });

  test('elegir una página la abre en el editor y en la vista previa', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page);
    await expect(previewFrame(page).locator('.sa-hero')).toBeVisible();

    await page.locator('.st-outline').getByRole('button', { name: /^Servicios/ }).click();
    await expect(page.locator('#st-editor-title')).toHaveText('Servicios');
    await expect(page.getByRole('link', { name: 'Ver página publicada' })).toHaveAttribute('href', '/p/arta/servicios');
    await expect(previewFrame(page).locator('h1')).toHaveText('Todo lo que un show necesita');
  });

  test('subir una página en el menú queda como borrador hasta publicar', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page);

    await page.getByRole('button', { name: 'Subir Noticias en el menú' }).click();
    await expect(page.locator('.st-pending')).toContainText('El orden del sitio');
    const saved = lastCall(state, '/studio/pages');
    expect(saved?.body).toMatchObject({ sectionKey: 'site_layout', draft: true });
    expect(saved?.body.contentJson.pages.map((p: { key: string }) => p.key).slice(0, 4)).toEqual(['inicio', 'cartelera', 'nosotros', 'noticias']);

    await page.getByRole('button', { name: 'Publicar todo' }).click();
    await expect(page.getByText(PUBLISHED)).toBeVisible();
    await expect(page.locator('.st-pending')).toHaveCount(0);
    expect(lastCall(state, '/studio/pages/publish')).toBeTruthy();
    await expect(previewFrame(page).locator('.sa-nav__links a').nth(2)).toHaveText('Noticias');
  });

  test('quitar una página del sitio y volver a ponerla', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page);

    await page.getByRole('button', { name: 'Quitar del sitio la página Noticias' }).click();
    await expect(page.locator('.st-outline .st-block', { hasText: 'Noticias' })).toContainText('Quitada del sitio');
    // Inicio avisa por qué su sección ya no sale.
    await expect(page.locator('.st-home__row', { hasText: 'Noticias' })).toContainText('su página está quitada');
    await page.getByRole('button', { name: 'Poner en el sitio la página Noticias' }).click();
    await expect(page.locator('.st-outline .st-block', { hasText: 'Noticias' })).not.toContainText('Quitada del sitio');
  });

  test('Contacto se mueve pero no se quita', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page);
    await expect(page.getByRole('button', { name: 'Subir Contacto en el menú' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quitar del sitio la página Contacto' })).toHaveCount(0);
  });

  test('acomodar las secciones de Inicio', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page);

    await page.getByRole('button', { name: 'Subir Nosotros', exact: true }).click();
    await expect(page.locator('.st-pending')).toContainText('El orden del sitio');
    const saved = lastCall(state, '/studio/pages');
    expect(saved?.body.contentJson.blocks.slice(0, 2).map((b: { id: string }) => b.id)).toEqual(['nosotros', 'cartelera']);
    await expect(previewFrame(page).locator('main > section').first()).toHaveId('nosotros');

    await page.getByRole('button', { name: 'Quitar de Inicio Noticias' }).click();
    await expect(page.locator('.st-home__row', { hasText: 'Noticias' })).toContainText('Quitada de Inicio');
    await page.getByRole('button', { name: 'Poner en Inicio Noticias' }).click();
    await expect(page.locator('.st-home__row', { hasText: 'Noticias' })).not.toContainText('Quitada de Inicio');

    // Tocar una sección lleva a la página donde se edita.
    await page.locator('.st-home__open', { hasText: 'Próximos shows' }).click();
    await expect(page.locator('#st-editor-title')).toHaveText('Cartelera');
  });

  test('poner una sección nueva en Inicio y borrarla', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page);

    await page.getByRole('button', { name: '+ Poner sección nueva' }).click();
    await page.locator('.st-outline__add').getByRole('button', { name: /Texto con foto/ }).click();
    await expect(page.locator('#st-editor-title')).toHaveText('Texto con foto');

    await page.getByLabel('Titular').fill('Nuestra gira');
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.locator('#st-editor-title')).toHaveText('Nuestra gira');
    const saved = lastCall(state, '/studio/pages');
    expect(saved?.body.sectionKey).toMatch(/^bloque_/);
    expect(saved?.body.contentJson.headline).toBe('Nuestra gira');

    await page.getByRole('button', { name: '← Inicio' }).click();
    await page.getByRole('button', { name: 'Borrar Nuestra gira' }).click();
    await page.getByRole('button', { name: 'Borrar sección' }).click();
    await expect(page.locator('.st-home')).not.toContainText('Nuestra gira');
  });

  test('agregar una historia con foto y publicarla', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'historias');

    await page.getByRole('button', { name: '+ Agregar historia' }).click();
    await page.getByRole('button', { name: 'Publicar', exact: true }).first().click();
    await expect(page.locator('.st-form__error')).toContainText('Falta la foto o el video');

    await page.locator('.st-sheet input[type="file"]').setInputFiles(PIXEL_PNG);
    await expect(page.locator('.st-sheet .st-media img')).toHaveAttribute('src', /subida-/);
    await page.getByLabel('Título', { exact: true }).fill('Montaje en Explanada');
    await page.getByRole('button', { name: 'Publicar', exact: true }).first().click();

    await expect(page.getByText(PUBLISHED)).toBeVisible();
    await expect(page.locator('.st-row', { hasText: 'Montaje en Explanada' })).toContainText('Publicado');
    expect(lastCall(state, '/studio/items')?.body).toMatchObject({ kind: 'historia', title: 'Montaje en Explanada', active: true });
  });

  test('subir, bajar, despublicar y quitar contenido', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'historias');

    await page.getByRole('button', { name: 'Bajar Así se ve desde el escenario' }).click();
    await expect(page.locator('.st-row').first()).toContainText('Prueba de luces');
    // Subir y Bajar mueven la fila antes de llamar al API: la llamada puede llegar un instante después.
    await expect.poll(() => lastCall(state, '/studio/reorder')?.body).toEqual({ kind: 'historia', ids: ['h2', 'h1', 'h3'] });
    await expect(page.getByRole('button', { name: 'Despublicar Prueba de luces' })).toBeEnabled();

    await page.getByRole('button', { name: 'Despublicar Prueba de luces' }).click();
    await expect(page.locator('.st-row', { hasText: 'Prueba de luces' })).toContainText('Borrador');

    await page.getByRole('button', { name: 'Quitar Historia en borrador' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Quitar' }).click();
    await expect(page.locator('.st-row', { hasText: 'Historia en borrador' })).toHaveCount(0);
  });

  test('un show pide lo que necesita y arma su dirección solo', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'cartelera');

    await page.getByRole('button', { name: '+ Agregar show' }).click();
    await page.getByLabel('Nombre del show').fill('Los Ecos de Cholula');
    await page.getByRole('button', { name: 'Publicar', exact: true }).first().click();
    await expect(page.locator('.st-form__error')).toContainText('el póster');
    await expect(page.locator('.st-form__error')).toContainText('la fecha');

    await page.locator('.st-sheet input[type="file"]').setInputFiles(PIXEL_PNG);
    await expect(page.locator('.st-sheet .st-media img')).toHaveAttribute('src', /subida-/);
    await page.getByLabel('Fecha', { exact: true }).fill('2027-03-14');
    await page.getByLabel('Enlace de boletos').fill('https://boletos.example.com/x');
    await page.getByRole('button', { name: 'Publicar', exact: true }).first().click();

    await expect(page.getByText(PUBLISHED)).toBeVisible();
    // Ya hay un «los-ecos-de-cholula»: no choca con una publicación existente.
    expect(lastCall(state, '/studio/news')?.body).toMatchObject({
      template: 'evento',
      slug: 'los-ecos-de-cholula',
      eventDate: '2027-03-14',
      published: true,
    });
  });

  test('una noticia con la misma dirección que otra recibe una libre', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'noticias');

    await page.getByRole('button', { name: '+ Agregar noticia' }).click();
    await page.getByLabel('Título', { exact: true }).fill('Festival de verano');
    await page.locator('.st-sheet').getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('Borrador guardado')).toBeVisible();
    expect(lastCall(state, '/studio/news')?.body).toMatchObject({ slug: 'festival-de-verano-2', published: false });
  });

  test('lo que se escribe se ve en la vista previa antes de guardar', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'nosotros');
    const frame = previewFrame(page);
    await expect(frame.locator('h1')).toHaveText('Producimos el show completo');

    await page.getByLabel('Titular').first().fill('Hacemos el show entero');
    await expect(frame.locator('h1')).toHaveText('Hacemos el show entero');
    // Nada se ha guardado todavía.
    expect(state.calls).toHaveLength(0);
    await expect(page.getByText('Sin guardar: la vista previa ya lo enseña.')).toBeVisible();

    await page.getByRole('button', { name: 'Guardar borrador' }).first().click();
    await expect(page.getByText('Borrador guardado.')).toBeVisible();
    expect(lastCall(state, '/studio/pages')?.body).toMatchObject({ sectionKey: 'home_about', draft: true });
    await expect(page.locator('.st-banner', { hasText: 'Hay un borrador sin publicar' })).toBeVisible();

    await page.getByRole('button', { name: 'Publicar', exact: true }).first().click();
    await expect(page.getByText(PUBLISHED)).toBeVisible();
    expect(lastCall(state, '/studio/pages')?.body).toMatchObject({ sectionKey: 'home_about', published: true });
  });

  test('lo que se escribe mientras carga la vista previa también llega', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    // La vista previa tarda: lo escrito llega antes de que exista quien lo reciba.
    await page.route('**/api/studio/preview', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await open(page, 'nosotros');
    await page.getByLabel('Titular').first().fill('Escrito muy pronto');
    await expect(previewFrame(page).locator('h1')).toHaveText('Escrito muy pronto');
  });

  test('cada servicio se edita con su detalle y lo que incluye', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'servicios');

    await page.getByLabel('Texto de su página').first().fill('Nuestro texto de producción');
    await page.getByLabel('Qué incluye').first().fill('Una cosa\nOtra cosa');
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText(PUBLISHED)).toBeVisible();

    const saved = lastCall(state, '/studio/pages');
    expect(saved?.body.sectionKey).toBe('home_modulos');
    expect(saved?.body.contentJson.tiles[0]).toMatchObject({ title: 'Producción', detail: 'Nuestro texto de producción', includes: 'Una cosa\nOtra cosa' });
  });

  test('un servicio guardado sin detalle enseña en el formulario lo mismo que el sitio', async ({ page }) => {
    const state = siteState();
    state.pages.push({
      id: 'mods',
      sectionKey: 'home_modulos',
      published: true,
      contentJson: { tiles: [{ title: 'Hospitalidad', body: 'Resumen guardado' }] },
    });
    await mockStudio(page, state);
    await open(page, 'servicios');

    await expect(page.getByLabel('Resumen')).toHaveValue('Resumen guardado');
    await expect(page.getByLabel('Texto de su página')).not.toHaveValue('');
    await expect(page.getByLabel('Qué incluye')).toHaveValue(/Camerinos preparados/);
  });

  test('agregar y acomodar preguntas frecuentes', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'preguntas');

    await page.getByRole('button', { name: '+ Agregar pregunta' }).click();
    await page.getByLabel('Pregunta', { exact: true }).last().fill('¿Hay estacionamiento?');
    await page.getByLabel('Respuesta').last().fill('Sí, en el recinto.');
    await page.getByRole('button', { name: 'Subir Pregunta 5' }).click();
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText(PUBLISHED)).toBeVisible();

    const faqs = lastCall(state, '/studio/pages')?.body.contentJson.faqs;
    expect(faqs).toHaveLength(5);
    expect(faqs[3].question).toBe('¿Hay estacionamiento?');
  });

  test('contacto y ubicación se editan en la misma página', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'contacto');

    await page.getByText('Dirección y mapa', { exact: true }).click();
    await page.getByLabel('Dirección', { exact: true }).fill('Otra calle 123, Puebla');
    await page.getByRole('button', { name: 'Publicar', exact: true }).last().click();
    await expect(page.getByText(PUBLISHED)).toBeVisible();
    expect(lastCall(state, '/studio/pages')?.body).toMatchObject({ sectionKey: 'home_ubicacion', contentJson: { address: 'Otra calle 123, Puebla' } });
    await expect(previewFrame(page).getByText('Otra calle 123, Puebla')).toBeVisible();
  });

  test('los datos del sitio llegan al pie de página', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'ajustes');

    await page.getByLabel('Instagram').fill('https://instagram.com/artaproducciones');
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText(PUBLISHED)).toBeVisible();
    await expect(previewFrame(page).locator('.sa-footer').getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://instagram.com/artaproducciones',
    );
  });

  test('una foto HEIC se rechaza con una explicación', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, 'galeria');

    await page.getByRole('button', { name: '+ Agregar foto' }).click();
    await page.locator('.st-sheet input[type="file"]').setInputFiles({ ...PIXEL_PNG, name: 'IMG_0001.HEIC', mimeType: 'image/heic' });
    await expect(page.getByText(/formato HEIC/)).toBeVisible();
    await expect(page.locator('.st-sheet .st-media img')).toHaveCount(0);
  });

  test('los avisos de revisión siguen abriendo el contenido correcto', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await page.goto('/studio?tab=news');
    await expect(page.locator('#st-editor-title')).toHaveText('Noticias');
    await page.goto('/studio?tab=aliado');
    await expect(page.locator('#st-editor-title')).toHaveText('Nosotros');
    await page.goto('/studio?tab=carousel');
    await expect(page.locator('#st-editor-title')).toHaveText('Inicio');
  });
});

test.describe('Studio · practicante', () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test('deja borradores y los manda a revisión; no publica', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state, PRACTICANTE_USER);
    await open(page, 'historias');

    await expect(page.getByRole('link', { name: 'Perfiles de practicante' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Despublicar/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Publicar/ })).toHaveCount(0);
    // Lo publicado no se toca.
    await expect(page.locator('.st-row', { hasText: 'Prueba de luces' })).toContainText('Lo cambia dirección');
    await expect(page.getByRole('button', { name: 'Editar Prueba de luces' })).toHaveCount(0);

    await page.getByRole('button', { name: '+ Agregar historia' }).click();
    await page.locator('.st-sheet input[type="file"]').setInputFiles(PIXEL_PNG);
    await expect(page.locator('.st-sheet .st-media img')).toHaveAttribute('src', /subida-/);
    await page.getByLabel('Título', { exact: true }).fill('Mi primera historia');
    await page.locator('.st-sheet').getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText(/Borrador guardado/)).toBeVisible();
    expect(lastCall(state, '/studio/items')?.body).toMatchObject({ title: 'Mi primera historia', active: false });

    await page.getByRole('button', { name: 'Enviar a revisión Mi primera historia' }).click();
    await expect(page.getByText(/Enviado a revisión/)).toBeVisible();
    await expect(page.locator('.st-row', { hasText: 'Mi primera historia' })).toContainText('En revisión');
  });

  test('sus cambios a una página son un borrador que manda a revisión', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state, PRACTICANTE_USER);
    await open(page, 'nosotros');

    await page.getByLabel('Titular').first().fill('Mi propuesta');
    await page.getByRole('button', { name: 'Guardar borrador' }).first().click();
    await expect(page.getByText(/Borrador guardado/)).toBeVisible();
    expect(lastCall(state, '/studio/pages')?.body).toMatchObject({ sectionKey: 'home_about', draft: true });

    await page.getByRole('button', { name: 'Enviar a revisión' }).first().click();
    await expect(page.getByText(/Enviado a revisión/)).toBeVisible();
    expect(lastCall(state, '/studio/review')?.body).toEqual({ kind: 'section', id: 'home_about' });
  });
});

test.describe('Studio · teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('se puede usar y la vista previa abre encima', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page);

    await expect(page.locator('.st-grid')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await expect(page.locator('.st-preview-slot')).toBeHidden();
    await page.getByRole('button', { name: 'Vista previa' }).click();
    await expect(page.locator('.st-preview-slot')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.locator('.st-preview-slot')).toBeHidden();
  });
});
