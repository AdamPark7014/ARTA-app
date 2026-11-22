import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page, type Route } from '@playwright/test';

import { mockApi, type ApiStubs } from '../support/mock-api';
import { RICH_STUBS, RICH_USER } from '../support/rich-fixtures';
import { clean, hideDevBadge, LOCALE, quietDevReload, settle } from './asentar';
import { domAudit } from './dom-audit';

/**
 * Captura a pedido. Sirve para ver a ojo una pantalla en un estado concreto (un menú abierto, un formulario a
 * medio llenar, una lista vacía, un error del servidor) sin escribir un spec. No es parte de la suite normal.
 *
 *   CAP_PLAN=/ruta/plan.json CAP_OUT=/ruta/salida E2E_PREBUILT=1 \
 *     npx playwright test -c playwright.audit.config.ts e2e/audit/captura.audit.ts --trace off
 *
 * El plan es un JSON: { "porDefecto": {…}, "tomas": [ {…}, … ] }. Cada toma:
 *
 *   nombre     nombre del archivo (sin extensión)
 *   ruta       por ejemplo "/tasks?nueva=1"
 *   entidad    "ARTA" (por defecto), "EXPLANADA" o "ambas"
 *   vp         "1536x864" (por defecto) o una lista: ["1536x864", "390x844"]; menos de 768 de ancho es teléfono
 *   rol        recorre como ese rol (compras, contenido…) en vez de administrador
 *   app        true: como la app del teléfono (sin barras del panel)
 *   sinSesion  true: sin sesión iniciada (pantallas de acceso)
 *   completa   true: la página entera, no solo lo que cabe en la ventana
 *   recorte    selector: captura solo ese elemento
 *   escala     2 para una captura nítida que va a ver una persona
 *   stubs      respuestas de la API que cambian: { "/tasks/mine": [] } deja la lista vacía
 *   falla      rutas de la API que contestan 500: ["/tasks/mine"]
 *   lento      rutas de la API que tardan (ms): { "/tasks/mine": 4000 }; con "sinAsentar" se ve la carga
 *   sinAsentar true: no espera a que termine de cargar antes de los pasos
 *   local      valores de localStorage: { "tasks.layout": "list" }
 *   mide       selectores a medir: ["h1", ".btn-primary"]; el .json trae de cada uno (hasta 8) su caja, letra,
 *              peso, interlineado, color, fondo, relleno, radio y borde, para comparar contra el sistema visual
 *   pasos      lista, en orden: { "clic": sel } · { "escribe": [sel, texto] } · { "tecla": "Tab", "veces": 3 } ·
 *              { "encima": sel } · { "foco": sel } · { "elige": [sel, valor] } · { "espera": ms o sel } ·
 *              { "baja": px o sel } · { "js": "código" } · { "toma": "sufijo" } (captura intermedia)
 *
 * Los selectores son los de Playwright: ".clase", "text=Guardar", "role=button[name=\"Nueva tarea\"]".
 * Salida por toma, tamaño y entidad: <nombre>-<arta|audi>-<ancho>.png y un .json con lo medido (texto cortado,
 * recortes, encimados, contraste, scroll lateral), las llamadas a la API que hizo la pantalla y los errores de consola.
 */

type Paso = {
  clic?: string;
  escribe?: [string, string];
  tecla?: string;
  veces?: number;
  encima?: string;
  foco?: string;
  elige?: [string, string];
  espera?: number | string;
  baja?: number | string;
  js?: string;
  toma?: string;
};

type Toma = {
  nombre: string;
  ruta: string;
  entidad?: 'ARTA' | 'EXPLANADA' | 'ambas';
  vp?: string | string[];
  rol?: string;
  app?: boolean;
  sinSesion?: boolean;
  completa?: boolean;
  recorte?: string;
  escala?: number;
  stubs?: Record<string, unknown>;
  falla?: string[];
  lento?: Record<string, number>;
  sinAsentar?: boolean;
  local?: Record<string, string>;
  mide?: string[];
  pasos?: Paso[];
};

const PLAN = process.env.CAP_PLAN;
const OUT = process.env.CAP_OUT || join(process.cwd(), 'e2e', '.output', 'capturas');
const PORT = Number(process.env.E2E_PORT || 3100);
const APP_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/129.0.0.0 Mobile Safari/537.36 ArtaApp/0.2.0 (Android 14; test)';
/** Ruido que no es de la pantalla: el canal en vivo no existe sin el servidor de la API. */
const NOISE = /socket\.io|WebSocket|webpack-hmr|favicon|ERR_CONNECTION_REFUSED|Download the React DevTools/i;

const plan: { porDefecto?: Partial<Toma>; tomas: Toma[] } =
  PLAN && existsSync(PLAN) ? JSON.parse(readFileSync(PLAN, 'utf8')) : { tomas: [] };

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function stubsFor(toma: Toma): ApiStubs {
  const user = toma.rol ? { ...RICH_USER, roleKey: toma.rol, permissions: [] } : RICH_USER;
  const table: ApiStubs = { ...RICH_STUBS, '/auth/me': { user }, ...(toma.stubs || {}) };
  if (toma.sinSesion) delete table['/auth/me'];
  for (const path of toma.falla || []) {
    table[path] = (route: Route) => fulfillJson(route, { message: 'Error interno del servidor' }, 500);
  }
  for (const [path, ms] of Object.entries(toma.lento || {})) {
    const entry = table[path];
    table[path] = async (route: Route) => {
      await new Promise((r) => setTimeout(r, ms));
      if (typeof entry === 'function') return (entry as (r: Route) => unknown)(route);
      return fulfillJson(route, entry === undefined ? [] : entry);
    };
  }
  return table;
}

async function runStep(page: Page, paso: Paso, shot: (suffix: string) => Promise<void>) {
  if (paso.clic) await page.locator(paso.clic).first().click();
  else if (paso.escribe) await page.locator(paso.escribe[0]).first().fill(paso.escribe[1]);
  else if (paso.tecla) for (let i = 0; i < (paso.veces || 1); i++) await page.keyboard.press(paso.tecla);
  else if (paso.encima) await page.locator(paso.encima).first().hover();
  else if (paso.foco) await page.locator(paso.foco).first().focus();
  else if (paso.elige) await page.locator(paso.elige[0]).first().selectOption(paso.elige[1]);
  else if (typeof paso.espera === 'number') await page.waitForTimeout(paso.espera);
  else if (typeof paso.espera === 'string') await page.locator(paso.espera).first().waitFor();
  else if (typeof paso.baja === 'number') await page.mouse.wheel(0, paso.baja);
  else if (typeof paso.baja === 'string') await page.locator(paso.baja).first().scrollIntoViewIfNeeded();
  else if (paso.js) await page.evaluate(paso.js);
  else if (paso.toma) await shot(paso.toma);
}

mkdirSync(OUT, { recursive: true });

if (!plan.tomas.length) {
  test('captura: sin plan', () => {
    test.skip(true, 'Falta CAP_PLAN con la lista de tomas.');
  });
}

for (const raw of plan.tomas) {
  const toma: Toma = { ...(plan.porDefecto || {}), ...raw };
  const entities = toma.entidad === 'ambas' ? (['ARTA', 'EXPLANADA'] as const) : ([toma.entidad || 'ARTA'] as const);
  const vps = Array.isArray(toma.vp) ? toma.vp : [toma.vp || '1536x864'];

  for (const entity of entities) {
    for (const vp of vps) {
      const [w, h] = vp.split('x').map(Number);
      const stem = `${toma.nombre}-${entity === 'ARTA' ? 'arta' : 'audi'}-${w}`;

      test(`captura ${stem}`, async ({ browser }) => {
        test.setTimeout(240_000);
        const host = entity === 'ARTA' ? 'arta.localhost' : 'auditorio.localhost';
        const phone = w < 768;
        const context = await browser.newContext({
          viewport: { width: w, height: h },
          reducedMotion: 'reduce',
          locale: LOCALE,
          isMobile: phone,
          hasTouch: phone,
          deviceScaleFactor: toma.escala || 1,
          ...(toma.app ? { userAgent: APP_UA } : {}),
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        await quietDevReload(page);

        const errors: string[] = [];
        page.on('console', (m) => {
          if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`consola: ${m.text().slice(0, 300)}`);
        });
        page.on('pageerror', (e) => errors.push(`página: ${String(e).slice(0, 300)}`));
        /** Llamadas a la API, en orden de aparición. En desarrollo React monta dos veces: ahí salen dobles. */
        const calls = new Map<string, number>();
        page.on('request', (req) => {
          const u = new URL(req.url());
          if (!u.pathname.startsWith('/api/')) return;
          const key = `${req.method()} ${u.pathname.replace(/^\/api/, '')}`;
          calls.set(key, (calls.get(key) || 0) + 1);
        });

        await page.addInitScript(
          ([ent, local]) => {
            try {
              localStorage.setItem('arta_entity', ent as string);
              for (const [k, v] of Object.entries(local as Record<string, string>)) localStorage.setItem(k, v);
            } catch {
              /* nada */
            }
          },
          [entity, toma.local || {}] as const,
        );
        if (!toma.sinSesion) {
          await context.addCookies([
            { name: 'arta_session', value: '1', domain: host, path: '/' },
            { name: 'arta_csrf', value: 'e2e-csrf-token', domain: host, path: '/' },
          ]);
        }
        await mockApi(page, stubsFor(toma));

        const stepErrors: string[] = [];
        let status = 0;
        const shot = async (suffix: string) => {
          if (status < 500) await hideDevBadge(page);
          const path = join(OUT, `${stem}${suffix ? `-${suffix}` : ''}.png`);
          if (toma.recorte && !suffix) await page.locator(toma.recorte).first().screenshot({ path });
          else await page.screenshot({ path, fullPage: !!toma.completa });
        };

        try {
          const resp = await page.goto(`http://${host}:${PORT}${toma.ruta}`, {
            waitUntil: 'domcontentloaded',
            timeout: 120_000,
          });
          status = resp?.status() ?? 0;
          if (status >= 500) errors.push(`el servidor contestó ${status}: revisa que el código compile`);
          if (!toma.sinAsentar) await settle(page);
          for (const [i, paso] of (toma.pasos || []).entries()) {
            try {
              await runStep(page, paso, shot);
              if (!paso.toma && !paso.espera) await page.waitForTimeout(250);
            } catch (err) {
              stepErrors.push(`paso ${i + 1} ${JSON.stringify(paso)}: ${String(err).split('\n')[0].slice(0, 240)}`);
              break;
            }
          }
          await page.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
          );
        } catch (err) {
          stepErrors.push(`no cargó: ${String(err).split('\n')[0].slice(0, 240)}`);
        }

        const res = await page
          .evaluate(domAudit)
          .then(clean)
          .catch(() => null);
        const measured = await page
          .evaluate((sels) => {
            const out: Record<string, unknown[]> = {};
            for (const sel of sels) {
              let nodes: Element[] = [];
              try {
                nodes = Array.from(document.querySelectorAll(sel));
              } catch {
                out[sel] = ['selector inválido (aquí solo CSS)'];
                continue;
              }
              out[sel] = nodes
                .filter((el) => el.getBoundingClientRect().width > 0)
                .slice(0, 8)
                .map((el) => {
                  const r = el.getBoundingClientRect();
                  const cs = getComputedStyle(el);
                  return {
                    texto: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
                    caja: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
                    letra: `${cs.fontSize} / ${cs.fontWeight} / ${cs.lineHeight} · ${cs.fontFamily.split(',')[0]}`,
                    interletra: cs.letterSpacing,
                    color: cs.color,
                    fondo: cs.backgroundColor,
                    relleno: cs.padding,
                    margen: cs.margin,
                    radio: cs.borderRadius,
                    borde: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
                    sombra: cs.boxShadow,
                    separacion: cs.gap,
                  };
                });
            }
            return out;
          }, toma.mide || [])
          .catch(() => ({}));
        await shot('').catch((err) => stepErrors.push(`sin captura: ${String(err).split('\n')[0].slice(0, 200)}`));
        const open = <T extends { justified?: boolean }>(list: T[] | undefined) => (list || []).filter((i) => !i.justified);
        const summary = {
          nombre: stem,
          url: page.url().replace(/^https?:\/\/[^/]+/, ''),
          titulo: await page.title().catch(() => ''),
          estado: status,
          scrollLateral: res?.hscroll ? res.hscroll.detail : null,
          texto: open(res?.text),
          recortes: open(res?.clip),
          encimados: open(res?.overlap),
          contraste: open(res?.contrast),
          medidas: measured,
          api: Object.fromEntries(calls),
          errores: [...stepErrors, ...errors],
        };
        writeFileSync(join(OUT, `${stem}.json`), JSON.stringify(summary, null, 2));
        console.log(
          [
            stem,
            `estado ${status}`,
            `scroll-lateral ${summary.scrollLateral ? 'SÍ' : 'no'}`,
            `texto ${summary.texto.length}`,
            `recortes ${summary.recortes.length}`,
            `encimados ${summary.encimados.length}`,
            `contraste ${summary.contraste.length}`,
            `errores ${summary.errores.length}`,
          ].join(' · '),
        );
        await context.close();
        expect(stepErrors, 'pasos del plan').toEqual([]);
      });
    }
  }
}
