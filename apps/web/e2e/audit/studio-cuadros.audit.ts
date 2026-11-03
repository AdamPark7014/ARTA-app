import { devices, expect, test, type Browser, type Page } from '@playwright/test';

import { mockStudio, siteState } from '../support/site-fixtures';

/**
 * Qué tan fluido va Studio y qué lo frena, con el contenido real del sitio en su vista previa.
 * Se corre a mano (.github/workflows/medir-safari.yml), con una sola prueba a la vez para que no
 * se estorben: AUDIT_WORKERS=1 MEDIR_STUDIO=1. La sesión es de mentira: no toca ninguna cuenta.
 */
test.skip(!process.env.MEDIR_STUDIO, 'Solo a mano: MEDIR_STUDIO=1');

const BASE = `http://arta.localhost:${process.env.E2E_PORT || 3100}`;
const SITIO = 'https://artaproducciones.com';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _motor, ...IPHONE } = devices['iPhone 15'];
const TAMANOS = {
  'Mac 1536x864 @2x': { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 2 },
  iPhone: IPHONE,
};

const SIN_ANIMAR = '*,*::before,*::after{animation:none!important;transition:none!important}';
const SIN_EFECTOS =
  '*,*::before,*::after{filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;mask-image:none!important;-webkit-mask-image:none!important}';

type Variante = { css?: string; sinMarco?: boolean; abrir?: boolean; solo?: keyof typeof TAMANOS };
const VARIANTES: Record<string, Variante> = {
  'tal cual': {},
  'sin vista previa': { sinMarco: true },
  'marco sin animaciones': { css: SIN_ANIMAR },
  'marco sin filtros ni máscaras': { css: SIN_EFECTOS },
  'vista previa abierta': { abrir: true, solo: 'iPhone' },
};

const fotos = new Map<string, { body: Buffer; type: string } | null>();
let publico: unknown = null;

async function contenidoReal() {
  if (!publico) publico = await (await fetch(`${SITIO}/api/studio/public/ARTA`)).json();
  return publico;
}

async function foto(path: string) {
  if (!fotos.has(path)) {
    const r = await fetch(SITIO + path);
    fotos.set(path, r.ok ? { body: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || 'image/jpeg' } : null);
  }
  return fotos.get(path);
}

/** El sitio de verdad dentro del marco; lo que se edita sigue siendo de mentira. */
async function conContenidoReal(page: Page) {
  const bajado = { bytes: 0, fotos: 0 };
  const datos = await contenidoReal();
  for (const ruta of ['**/api/studio/preview', '**/api/studio/public/ARTA']) {
    await page.route(ruta, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(datos) }));
  }
  await page.route('**/uploads/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith('/api/')) return route.fallback();
    const f = await foto(pathname);
    if (!f) return route.fallback();
    bajado.bytes += f.body.length;
    bajado.fotos += 1;
    return route.fulfill({ status: 200, contentType: f.type, body: f.body });
  });
  return bajado;
}

/** Cuadros por segundo y el peor cuadro, sin tocar nada. */
const enReposo = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ fps: number; peorMs: number }>((resolve) => {
        const inicio = performance.now();
        let cuadros = 0;
        let peor = 0;
        let antes = inicio;
        const paso = (ahora: number) => {
          cuadros += 1;
          peor = Math.max(peor, ahora - antes);
          antes = ahora;
          if (ahora - inicio < 6000) requestAnimationFrame(paso);
          else resolve({ fps: +(cuadros / ((ahora - inicio) / 1000)).toFixed(1), peorMs: Math.round(peor) });
        };
        requestAnimationFrame(paso);
      }),
  );

/** Del clic a que la pantalla lo enseña: dos cuadros después de abrir y cerrar el menú de secciones. */
const delClicAPantalla = (page: Page) =>
  page.evaluate(async () => {
    // Abrir cambia el botón por las opciones y su «Cancelar»: en par, el menú queda cerrado.
    const siguiente = () =>
      [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes('Poner sección nueva')) ??
      document.querySelector<HTMLElement>('.st-outline__add .btn-quiet');
    const pintado = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tiempos: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const boton = siguiente();
      if (!boton) return null;
      const a = performance.now();
      boton.click();
      await pintado();
      tiempos.push(performance.now() - a);
      await new Promise((r) => setTimeout(r, 200));
    }
    return { promedioMs: Math.round(tiempos.reduce((s, t) => s + t, 0) / tiempos.length), peorMs: Math.round(Math.max(...tiempos)) };
  });

/** De la tecla a la pantalla, con la vista previa recibiendo cada cambio. */
async function deTeclaAPantalla(page: Page) {
  await page.getByRole('button', { name: '+ Poner sección nueva' }).click({ timeout: 15_000 });
  await page.locator('.st-outline__add').getByRole('button', { name: /Texto con foto/ }).click({ timeout: 15_000 });
  await expect(page.locator('#st-editor-title')).toHaveText('Texto con foto', { timeout: 15_000 });
  const campo = await page.getByLabel('Titular').elementHandle({ timeout: 15_000 });
  if (!campo) return null;
  return campo.evaluate(async (el) => {
    const input = el as HTMLInputElement;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const poner = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const pintado = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tiempos: number[] = [];
    let texto = '';
    for (const letra of 'Nuestra gira') {
      texto += letra;
      const a = performance.now();
      poner?.call(input, texto);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await pintado();
      tiempos.push(performance.now() - a);
      await new Promise((r) => setTimeout(r, 120));
    }
    return { promedioMs: Math.round(tiempos.reduce((s, t) => s + t, 0) / tiempos.length), peorMs: Math.round(Math.max(...tiempos)) };
  });
}

async function medir(browser: Browser, tamano: keyof typeof TAMANOS, nombre: string, v: Variante) {
  const contexto = await browser.newContext({ baseURL: BASE, ...TAMANOS[tamano] });
  const page = await contexto.newPage();
  await mockStudio(page, siteState());
  const bajado = await conContenidoReal(page);
  if (v.sinMarco) {
    await page.route('**/site?embed=1*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
  }

  const t0 = Date.now();
  await page.goto('/studio', { waitUntil: 'load', timeout: 120_000 });
  await expect(page.locator('.st-outline')).toBeVisible({ timeout: 60_000 });
  const cargaMs = Date.now() - t0;
  await page.waitForTimeout(4000);

  if (v.css) {
    const marco = page.frames().find((f) => f.url().includes('embed=1'));
    await marco?.addStyleTag({ content: v.css });
  }
  if (v.abrir) await page.locator('.st-preview-toggle').click({ timeout: 15_000 });
  await page.waitForTimeout(1000);

  const reposo = await enReposo(page);
  const clic = v.abrir ? null : await delClicAPantalla(page);
  const tecla = v.abrir ? null : await deTeclaAPantalla(page).catch((e) => String(e).slice(0, 160));
  console.log(
    `MEDIDA ${test.info().project.name} · ${tamano} · ${nombre} · ${JSON.stringify({
      cargaMs,
      fotosDelMarco: bajado.fotos,
      mbDelMarco: +(bajado.bytes / 1048576).toFixed(1),
      reposo,
      clic,
      tecla,
    })}`,
  );
  await contexto.close();
}

for (const tamano of Object.keys(TAMANOS) as Array<keyof typeof TAMANOS>) {
  for (const [nombre, v] of Object.entries(VARIANTES)) {
    if (v.solo && v.solo !== tamano) continue;
    test(`${tamano} · ${nombre}`, async ({ browser }) => {
      test.setTimeout(180_000);
      await medir(browser, tamano, nombre, v);
    });
  }
}
