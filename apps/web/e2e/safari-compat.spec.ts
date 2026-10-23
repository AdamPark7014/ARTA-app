import { expect, test, type Route } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { TEST_USER, mockApi, mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Lo que en Safari (Mac) fallaba sin ruido y en Chrome no se notaba.
 *
 * Corre en Chromium con la suite normal; con `E2E_WEBKIT=1` también en el motor
 * de Safari. Cada prueba fija el contrato que protege a Safari aunque Chromium
 * no tenga el fallo: así no regresa sin que nadie lo vea.
 */

test.describe('Safari · login y 2FA', () => {
  test('lo que el autollenado escribe sin avisar a React también se manda', async ({ page }) => {
    let sent: { email?: string; password?: string } = {};
    await mockApi(page, {
      '/auth/login': async (route: Route) => {
        sent = route.request().postDataJSON() as typeof sent;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ requires2fa: true, challengeId: 'chal-e2e-safari-1' }),
        });
      },
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Panel Arta Producciones' })).toBeVisible();

    // Como el Llavero de Safari: el valor queda en el campo sin eventos input/change.
    await page.evaluate(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(document.querySelector('input[name="email"]'), 'E2E@arta.test');
      setValue.call(document.querySelector('input[name="password"]'), 'contrasena-e2e');
    });

    const enter = page.getByRole('button', { name: 'Entrar', exact: true });
    await expect(enter).toBeEnabled();
    await enter.click();

    await expect(page.getByRole('heading', { name: 'Verificación 2FA' })).toBeVisible();
    expect(sent).toEqual({ email: 'e2e@arta.test', password: 'contrasena-e2e' });
  });

  test('el código autollenado con espacio o guion llega solo con dígitos', async ({ page }) => {
    let code = '';
    await mockApi(page, {
      '/auth/login': { requires2fa: true, challengeId: 'chal-e2e-safari-2' },
      '/auth/2fa/verify-login': async (route: Route) => {
        code = (route.request().postDataJSON() as { code: string }).code;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: TEST_USER }),
        });
      },
      '/auth/me': { user: TEST_USER },
    });

    await page.goto('/login');
    await page.locator('input[name="email"]').fill('e2e@arta.test');
    await page.locator('input[name="password"]').fill('contrasena-e2e');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await page.getByPlaceholder('000000').fill('123 456');
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();

    await page.waitForURL('**/dashboard');
    expect(code).toBe('123456');
  });
});

const SETUP = {
  id: 'tk-e2e-1',
  boletera: 'Funticket',
  zonesJson: [{ zona: 'General', aforo: 500, precio: 450 }],
  createdAt: '2026-08-20T18:00:00.000Z',
  updatedAt: '2026-08-20T18:00:00.000Z',
};

const EVENT = {
  id: 'evt-e2e-1',
  name: 'Noche de Bandas',
  artist: 'Los Ecos',
  promoter: 'Arta Producciones',
  venue: 'Auditorio Arema',
  city: 'Puebla',
  status: 'ACTIVE',
  entity: 'ARTA',
  campaignType: 'INTERNAL',
  startsAt: '2026-09-20T02:00:00.000Z',
  endsAt: null,
  notes: '',
  checklists: [],
  purchaseOrders: [],
  financeRuns: [],
  campaign: null,
  ticketingSetups: [SETUP],
  files: [],
  tasks: [],
  sponsors: [],
};

test.describe('Safari · PDF en otra pestaña', () => {
  test('la pestaña se abre en el clic, antes de que el servidor termine el PDF', async ({
    page,
    context,
    baseURL,
  }) => {
    let release!: () => void;
    const serverDone = new Promise<void>((resolve) => (release = resolve));
    let pdfRequested = false;

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': EVENT,
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
      '/ticketing/tk-e2e-1/pdf': async (route: Route) => {
        pdfRequested = true;
        await serverDone;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: '/uploads/boletera-e2e.pdf' }),
        });
      },
    });
    // La pestaña nueva es otra página del contexto: su archivo se sirve aquí.
    await context.route('**/uploads/boletera-e2e.pdf', (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'PDF de la boletera' }),
    );

    await page.goto('/events/evt-e2e-1');
    await page.getByRole('navigation', { name: 'Módulos del evento' }).getByRole('button', { name: 'Boletera' }).click();

    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Descargar PDF' }).click();
    // Safari solo deja abrir la pestaña dentro del clic: tiene que existir ya,
    // con el servidor todavía generando.
    const tab = await popup;
    await expect.poll(() => pdfRequested).toBe(true);

    release();
    await tab.waitForURL('**/uploads/boletera-e2e.pdf');
    await expect(tab.locator('body')).toHaveText('PDF de la boletera');
  });
});

test.describe('Safari · visor de PDF', () => {
  test('«Escribir encima» abre el PDF aunque no exista Promise.withResolvers (Safari < 17.4)', async ({
    page,
    context,
    baseURL,
  }) => {
    const pdf = await PDFDocument.create();
    pdf
      .addPage([400, 300])
      .drawText('Contrato de prueba', { x: 40, y: 200, size: 18, font: await pdf.embedFont(StandardFonts.Helvetica) });
    const bytes = Buffer.from(await pdf.save());

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Lo que no tiene Safari antes de 17.4: el build moderno de pdf.js moría aquí.
    await page.addInitScript(() => {
      delete (Promise as unknown as Record<string, unknown>).withResolvers;
    });

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

    await page.goto('/events/evt-e2e-1');
    await page.getByRole('navigation', { name: 'Módulos del evento' }).getByRole('button', { name: 'Documentos' }).click();
    await page.getByRole('button', { name: 'Escribir encima' }).first().click();

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/withResolvers/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
