import { expect, test, type Page } from '@playwright/test';

import { mockStudio, PRACTICANTE_USER, siteState, type StudioState } from './support/site-fixtures';

/**
 * Studio: la maqueta completa del sitio en manos de quien no programa (pedido de Adam,
 * 01-11-2026: «que los practicantes puedan subir, quitar, bajar y poner historias, noticias, todo»).
 */

const PIXEL_PNG = {
  name: 'foto.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
};

async function open(page: Page, state: StudioState, bloque = '') {
  await page.goto(`/studio${bloque ? `?bloque=${bloque}` : ''}`);
  await expect(page.locator('.st-outline')).toBeVisible();
  void state;
}

const lastCall = (state: StudioState, path: string) => [...state.calls].reverse().find((c) => c.path === path);

test.describe('Studio · quien publica', () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test('el encabezado lleva a los perfiles de practicante', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state);
    await expect(page.getByRole('link', { name: 'Perfiles de practicante' })).toHaveAttribute('href', '/studio/practicantes');
  });

  test('la maqueta enseña la página de arriba a abajo', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state);

    const names = await page.locator('.st-outline .st-block__main strong').allTextContents();
    expect(names.slice(0, 4)).toEqual(['Portada', 'Cartelera', 'Historias', 'Nosotros']);
    expect(names).toContain('Datos del sitio');
    await expect(page.locator('.st-outline')).toContainText('2 shows');
    await expect(page.locator('.st-outline')).toContainText('3 historias · 1 sin publicar');
  });

  test('subir una sección queda como borrador hasta publicar', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state);

    await page.getByRole('button', { name: 'Subir Historias' }).click();
    await expect(page.locator('.st-pending')).toContainText('El orden de la página');
    const saved = lastCall(state, '/studio/pages');
    expect(saved?.body).toMatchObject({ sectionKey: 'site_layout', draft: true });
    expect(saved?.body.contentJson.blocks.slice(0, 2).map((b: { id: string }) => b.id)).toEqual(['historias', 'cartelera']);

    await page.getByRole('button', { name: 'Publicar todo' }).click();
    await expect(page.getByText('Publicado. Ya se ve en el sitio.')).toBeVisible();
    await expect(page.locator('.st-pending')).toHaveCount(0);
    expect(lastCall(state, '/studio/pages/publish')).toBeTruthy();
    // La vista previa ya enseña el orden nuevo.
    const frame = page.frameLocator('iframe[title="Vista previa del sitio"]');
    await expect(frame.locator('main > section').first()).toHaveId('historias');
  });

  test('quitar una sección del sitio y volver a ponerla', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state);

    await page.getByRole('button', { name: 'Quitar del sitio Noticias' }).click();
    await expect(page.locator('.st-block', { hasText: 'Noticias' })).toContainText('Quitada del sitio');
    await page.getByRole('button', { name: 'Poner en el sitio Noticias' }).click();
    await expect(page.locator('.st-block', { hasText: 'Noticias' })).not.toContainText('Quitada del sitio');
  });

  test('poner una sección nueva y borrarla', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state);

    await page.getByRole('button', { name: '+ Poner sección nueva' }).click();
    await page.locator('.st-outline__add').getByRole('button', { name: /Texto con foto/ }).click();
    await expect(page.locator('#st-editor-title')).toHaveText('Texto con foto');

    await page.getByLabel('Titular').fill('Nuestra gira');
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.locator('.st-outline')).toContainText('Nuestra gira');
    const saved = lastCall(state, '/studio/pages');
    expect(saved?.body.sectionKey).toMatch(/^bloque_/);
    expect(saved?.body.contentJson.headline).toBe('Nuestra gira');

    await page.getByRole('button', { name: 'Borrar Nuestra gira' }).click();
    await page.getByRole('button', { name: 'Borrar sección' }).click();
    await expect(page.locator('.st-outline')).not.toContainText('Nuestra gira');
  });

  test('agregar una historia con foto y publicarla', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state, 'historias');

    await page.getByRole('button', { name: '+ Agregar historia' }).click();
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.locator('.st-form__error')).toContainText('Falta la foto o el video');

    await page.locator('.st-sheet input[type="file"]').setInputFiles(PIXEL_PNG);
    await expect(page.locator('.st-media img')).toHaveAttribute('src', /subida-/);
    await page.getByLabel('Título').fill('Montaje en Explanada');
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();

    await expect(page.getByText('Publicado. Ya se ve en el sitio.')).toBeVisible();
    await expect(page.locator('.st-row', { hasText: 'Montaje en Explanada' })).toContainText('Publicado');
    expect(lastCall(state, '/studio/items')?.body).toMatchObject({ kind: 'historia', title: 'Montaje en Explanada', active: true });
  });

  test('subir, bajar, despublicar y quitar contenido', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state, 'historias');

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
    await open(page, state, 'cartelera');

    await page.getByRole('button', { name: '+ Agregar show' }).click();
    await page.getByLabel('Nombre del show').fill('Los Ecos de Cholula');
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.locator('.st-form__error')).toContainText('el póster');
    await expect(page.locator('.st-form__error')).toContainText('la fecha');

    await page.locator('.st-sheet input[type="file"]').setInputFiles(PIXEL_PNG);
    await expect(page.locator('.st-media img')).toHaveAttribute('src', /subida-/);
    await page.getByLabel('Fecha').fill('2027-03-14');
    await page.getByLabel('Enlace de boletos').fill('https://boletos.example.com/x');
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();

    await expect(page.getByText('Publicado. Ya se ve en el sitio.')).toBeVisible();
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
    await open(page, state, 'noticias');

    await page.getByRole('button', { name: '+ Agregar noticia' }).click();
    await page.getByLabel('Título', { exact: true }).fill('Festival de verano');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('Borrador guardado')).toBeVisible();
    expect(lastCall(state, '/studio/news')?.body).toMatchObject({ slug: 'festival-de-verano-2', published: false });
  });

  test('lo que se escribe se ve en la vista previa antes de guardar', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state, 'nosotros');
    const frame = page.frameLocator('iframe[title="Vista previa del sitio"]');
    await expect(frame.locator('#nosotros')).toContainText('Producimos el show completo');

    await page.getByLabel('Titular').fill('Hacemos el show entero');
    await expect(frame.locator('#nosotros')).toContainText('Hacemos el show entero');
    // Nada se ha guardado todavía.
    expect(state.calls).toHaveLength(0);
    await expect(page.getByText('Sin guardar: la vista previa ya lo enseña.')).toBeVisible();

    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('Borrador guardado.')).toBeVisible();
    expect(lastCall(state, '/studio/pages')?.body).toMatchObject({ sectionKey: 'home_about', draft: true });
    await expect(page.locator('.st-banner', { hasText: 'Hay un borrador sin publicar' })).toBeVisible();

    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Publicado. Ya se ve en el sitio.')).toBeVisible();
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
    await open(page, state, 'nosotros');
    await page.getByLabel('Titular').fill('Escrito muy pronto');
    const frame = page.frameLocator('iframe[title="Vista previa del sitio"]');
    await expect(frame.locator('#nosotros')).toContainText('Escrito muy pronto');
  });

  test('agregar y acomodar preguntas frecuentes', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state, 'faq');

    await page.getByRole('button', { name: '+ Agregar pregunta' }).click();
    await page.getByLabel('Pregunta').last().fill('¿Hay estacionamiento?');
    await page.getByLabel('Respuesta').last().fill('Sí, en el recinto.');
    await page.getByRole('button', { name: 'Subir Pregunta 5' }).click();
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Publicado. Ya se ve en el sitio.')).toBeVisible();

    const faqs = lastCall(state, '/studio/pages')?.body.contentJson.faqs;
    expect(faqs).toHaveLength(5);
    expect(faqs[3].question).toBe('¿Hay estacionamiento?');
  });

  test('los datos del sitio llegan al pie de página', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state, 'ajustes');

    await page.getByLabel('Instagram').fill('https://instagram.com/artaproducciones');
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Publicado. Ya se ve en el sitio.')).toBeVisible();
    const frame = page.frameLocator('iframe[title="Vista previa del sitio"]');
    await expect(frame.locator('.sa-footer').getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://instagram.com/artaproducciones',
    );
  });

  test('una foto HEIC se rechaza con una explicación', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await open(page, state, 'galeria');

    await page.getByRole('button', { name: '+ Agregar foto' }).click();
    await page.locator('.st-sheet input[type="file"]').setInputFiles({ ...PIXEL_PNG, name: 'IMG_0001.HEIC', mimeType: 'image/heic' });
    await expect(page.getByText(/formato HEIC/)).toBeVisible();
    await expect(page.locator('.st-media img')).toHaveCount(0);
  });

  test('el aviso de revisión de una noticia sigue abriendo Noticias', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state);
    await page.goto('/studio?tab=news');
    await expect(page.locator('#st-editor-title')).toHaveText('Noticias');
  });
});

test.describe('Studio · practicante', () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test('deja borradores y los manda a revisión; no publica', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state, PRACTICANTE_USER);
    await open(page, state, 'historias');

    await expect(page.getByRole('link', { name: 'Perfiles de practicante' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Despublicar/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Publicar/ })).toHaveCount(0);
    // Lo publicado no se toca.
    await expect(page.locator('.st-row', { hasText: 'Prueba de luces' })).toContainText('Lo cambia dirección');
    await expect(page.getByRole('button', { name: 'Editar Prueba de luces' })).toHaveCount(0);

    await page.getByRole('button', { name: '+ Agregar historia' }).click();
    await page.locator('.st-sheet input[type="file"]').setInputFiles(PIXEL_PNG);
    await expect(page.locator('.st-media img')).toHaveAttribute('src', /subida-/);
    await page.getByLabel('Título').fill('Mi primera historia');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText(/Borrador guardado/)).toBeVisible();
    expect(lastCall(state, '/studio/items')?.body).toMatchObject({ title: 'Mi primera historia', active: false });

    await page.getByRole('button', { name: 'Enviar a revisión Mi primera historia' }).click();
    await expect(page.getByText(/Enviado a revisión/)).toBeVisible();
    await expect(page.locator('.st-row', { hasText: 'Mi primera historia' })).toContainText('En revisión');
  });

  test('sus cambios a una sección son un borrador que manda a revisión', async ({ page }) => {
    const state = siteState();
    await mockStudio(page, state, PRACTICANTE_USER);
    await open(page, state, 'nosotros');

    await page.getByLabel('Titular').fill('Mi propuesta');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
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
    await open(page, state);

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
