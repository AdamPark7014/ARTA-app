import { expect, test, type Page } from '@playwright/test';

import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';

import { mockApi, mockAuthenticatedApi, seedSession, TEST_EVENTS } from './support/mock-api';
import { RICH_STUBS } from './support/rich-fixtures';

/**
 * Lo que en Safari de iPhone se nota y en Chrome de escritorio no.
 *
 * Corre en todos los proyectos con tamaño, toque y User-Agent de iPhone; en CI
 * (web-safari.yml) también en el motor de Safari. Ver docs/SAFARI.md.
 */

const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

test.use({
  viewport: { width: 390, height: 844 },
  userAgent: PHONE_UA,
  isMobile: true,
  hasTouch: true,
});

const EVENT = {
  ...TEST_EVENTS[0],
  promoter: 'Arta Producciones',
  city: 'Puebla',
  entity: 'ARTA',
  campaignType: 'INTERNAL',
  endsAt: null,
  notes: '',
  checklists: [],
  purchaseOrders: [],
  financeRuns: [],
  campaign: null,
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

const STUBS = {
  '/events/evt-e2e-1': EVENT,
  '/documents/event/evt-e2e-1': [],
  '/vendor/event/evt-e2e-1': [],
};

/** Campos donde se escribe con el teclado (no casillas, rangos ni archivos). */
async function smallFields(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SKIP = new Set(['checkbox', 'radio', 'range', 'file', 'hidden', 'color', 'button', 'submit', 'reset', 'image']);
    const out: string[] = [];
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('input, select, textarea, [contenteditable="true"], [contenteditable=""]'),
    );
    for (const el of els) {
      if (el instanceof HTMLInputElement && SKIP.has(el.type)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const size = parseFloat(cs.fontSize);
      if (size < 16) {
        const id =
          el.getAttribute('name') ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          (typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 2).join('.') : '') ||
          el.tagName.toLowerCase();
        out.push(`${el.tagName.toLowerCase()}[${id}] ${size}px`);
      }
    }
    return out;
  });
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.shell--loading')).toHaveCount(0);
  await page.waitForTimeout(250);
}

test.describe('Safari de iPhone · campos de 16 px', () => {
  // Con menos de 16 px, Safari de iPhone acerca la página al tocar el campo y
  // la deja descuadrada hasta que la persona pellizca para alejar.
  test('el login (correo, contraseña y código 2FA) no hace zoom al tocarlo', async ({ page }) => {
    await mockApi(page, { '/auth/login': { requires2fa: true, challengeId: 'chal-e2e-iphone' } });

    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    expect(await smallFields(page)).toEqual([]);

    await page.locator('input[name="email"]').fill('e2e@arta.test');
    await page.locator('input[name="password"]').fill('contrasena-e2e');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    const code = page.locator('input[name="code"]');
    await expect(code).toBeVisible();
    // El llavero de iOS ofrece el código: tiene que estar marcado como tal.
    await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(await smallFields(page)).toEqual([]);
  });

  const PAGES: Array<[name: string, url: string]> = [
    ['tareas', '/tasks'],
    ['evento · tareas', '/events/evt-e2e-1?tab=tasks'],
    ['evento · OC', '/events/evt-e2e-1?tab=ocs'],
    ['órdenes de compra', '/purchase-orders'],
    ['anticipos', '/advances'],
    ['eventos', '/events?scope=active'],
    ['nuevo evento', '/events/new'],
  ];

  for (const [name, url] of PAGES) {
    test(`${name}: ningún campo baja de 16 px`, async ({ page, baseURL }) => {
      await seedSession(page, baseURL!);
      await mockAuthenticatedApi(page, STUBS);

      await page.goto(url);
      await settle(page);

      expect(await smallFields(page), `${url}: campos que harían zoom en iPhone`).toEqual([]);
    });
  }
});

test.describe('Safari de iPhone · listas con scroll', () => {
  // El recorrido de cortes en WebKit marcó la campana a 390 px: el último aviso
  // quedaba cortado en seco, sin el desvanecido que en Chrome sí sale.
  test('la campana con más avisos de los que caben se desvanece abajo', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications': RICH_STUBS['/notifications'],
      '/notifications/unread-count': RICH_STUBS['/notifications/unread-count'],
    });

    await page.goto('/dashboard');
    await settle(page);
    await page.locator('.notif-btn').tap();
    const body = page.locator('.notif-panel__body');
    await expect(body.locator('.nt-row').first()).toBeVisible();

    const state = () =>
      body.evaluate(async (el) => {
        const cs = getComputedStyle(el);
        const raf = await Promise.race([
          new Promise((r) => requestAnimationFrame(() => r('raf ok'))),
          new Promise((r) => setTimeout(() => r('raf NO llegó en 1 s'), 1000)),
        ]);
        return {
          fade: el.getAttribute('data-fade-y'),
          fadeX: el.getAttribute('data-fade-x'),
          mask: (cs as unknown as Record<string, string>).webkitMaskImage || cs.maskImage,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollTop: el.scrollTop,
          overflowY: cs.overflowY,
          visibility: document.visibilityState,
          raf,
        };
      });
    await expect
      .poll(async () => (await state()).fade, { message: 'data-fade-y de la campana', timeout: 4000 })
      .toBe('end')
      .catch(async (e) => {
        throw new Error(`${e instanceof Error ? e.message : e}\nestado: ${JSON.stringify(await state())}`);
      });
    expect((await state()).mask).toContain('gradient');
  });

  test('un PDF se ve completo: el iframe de Safari enseña solo la primera página', async ({
    page,
    context,
    baseURL,
  }) => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const n of [1, 2, 3]) pdf.addPage([400, 500]).drawText(`Página ${n}`, { x: 40, y: 400, size: 24, font });
    const bytes = Buffer.from(await pdf.save());

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': {
        ...EVENT,
        ticketingSetups: [],
        files: [
          {
            id: 'f-pdf-1',
            fileName: 'contrato.pdf',
            url: '/uploads/contrato-e2e.pdf',
            kind: 'pdf',
            module: 'general',
            createdAt: '2026-08-20T18:00:00.000Z',
          },
        ],
      },
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
    });
    await context.route('**/uploads/contrato-e2e.pdf*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/pdf', body: bytes }),
    );

    await page.goto('/events/evt-e2e-1?tab=files');
    await page.getByRole('button', { name: 'Ver', exact: true }).first().click();

    await expect(page.locator('.pdfpages__page')).toHaveCount(3);
    await expect(page.locator('.pdfpages__page canvas').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('iframe.docview__frame')).toHaveCount(0);
  });

  test('la hoja tiene a la vista lo que en la compu es clic derecho', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': {
        ...EVENT,
        ticketingSetups: [],
        files: [
          {
            id: 'file-xlsx',
            fileName: 'Presupuesto.xlsx',
            url: '/uploads/demo.xlsx',
            kind: 'excel',
            module: null,
            createdAt: '2026-08-28T10:00:00.000Z',
          },
        ],
      },
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
    });
    await page.route('**/api/files/file-xlsx/inline', (route) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Concepto', 'Monto'], ['Audio', 12000]]), 'Presupuesto');
      return route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer,
      });
    });

    await page.goto('/events/evt-e2e-1?tab=files');
    await page.getByRole('button', { name: 'Editar', exact: true }).click();

    const menu = page.getByRole('button', { name: 'Filas y columnas' });
    await expect(page.getByRole('button', { name: 'Renombrar' })).toBeVisible();
    await expect(menu).toBeDisabled();

    await page.getByLabel('Celda A2', { exact: true }).tap();
    await expect(menu).toBeEnabled();
    await menu.tap();
    await expect(page.getByRole('menuitem', { name: 'Insertar fila arriba' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Insertar fila arriba' }).tap();
    await expect(page.getByLabel('Celda A3', { exact: true })).toHaveValue('Audio');
  });
});
