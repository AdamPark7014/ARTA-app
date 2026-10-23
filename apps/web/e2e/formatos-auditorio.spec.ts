import { expect, test } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Formatos del Auditorio (11-10-2026): el Compromiso de horarios es un
 * documento con texto fijo (condiciones y aceptación), una tabla que nace con
 * los conceptos del Word y firmas con el nombre de cada parte. Misma forma
 * que `apps/api/src/checklists/format-catalog.ts` (COMPROMISO_HORARIOS).
 */

const CONDICIONES = [
  'El escenario e instalaciones serán entregados a la Producción en buenas condiciones de operación, salvo cualquier condición o desperfecto previamente identificado y documentado.',
  'La Producción deberá revisar y recibir el escenario e instalaciones antes de iniciar sus actividades. Cualquier observación deberá reportarse inmediatamente al responsable del Auditorio.',
];

const CONCEPTOS = [
  'Inicio de montaje',
  'Llegada de ambulancia',
  'Llegada de planta de luz / generador eléctrico con caja acústica',
  '',
  'Inicio del show',
];

const DATA = {
  formatVersion: 4,
  sections: [
    {
      id: 'encabezado',
      title: 'Producción externa',
      layout: 'header',
      items: [
        { id: 'evento', label: 'Evento', type: 'text', value: 'SHOW EXPLANADA', bind: 'event.name', cols: 8 },
        { id: 'fecha', label: 'Fecha', type: 'date', value: '2026-11-15', bind: 'event.date', cols: 4 },
        { id: 'productor', label: 'Productor / empresa', type: 'text', value: '', bind: 'event.promoter', cols: 6 },
        { id: 'encargado', label: 'Encargado de producción', type: 'text', value: '', cols: 6 },
      ],
    },
    {
      id: 'horarios',
      title: 'Horarios y condiciones operativas',
      items: [
        {
          id: 'horarios',
          label: 'Horarios y condiciones operativas',
          type: 'table',
          columns: [
            { id: 'concepto', label: 'Concepto', width: 3.4, prefilled: true },
            { id: 'comprometido', label: 'Horario comprometido', type: 'time', width: 1.3 },
            { id: 'real', label: 'Hora real', type: 'time', width: 1.1 },
            { id: 'observaciones', label: 'Observaciones', width: 2.2 },
          ],
          rows: CONCEPTOS.map((concepto) => ({ concepto, comprometido: null, real: null, observaciones: null })),
          minRows: CONCEPTOS.length,
        },
      ],
    },
    {
      id: 'condiciones',
      title: 'Condiciones',
      items: CONDICIONES.map((label, i) => ({ id: `condicion_${i + 1}`, label, type: 'paragraph' })),
    },
    {
      id: 'aceptacion',
      title: 'Aceptación',
      items: [
        {
          id: 'aceptacion',
          label:
            'El Encargado de Producción Externa manifiesta conocer y aceptar los horarios y condiciones establecidos en el presente documento y se compromete a coordinar a su equipo, proveedores y personal para su cumplimiento.',
          type: 'paragraph',
        },
      ],
    },
    {
      id: 'firmas',
      title: 'Firmas digitales',
      items: [
        { id: 'firma_entregado', label: 'Producción externa', type: 'signature' },
        { id: 'firma_autorizado', label: 'Auditorio Explanada Puebla', type: 'signature' },
      ],
    },
  ],
};

const CHECKLIST = {
  id: 'chk-compromiso',
  title: 'Compromiso de horarios — Día del show',
  progressPct: 33,
  status: 'DRAFT',
  revision: 1,
  dataJson: DATA,
  pdfUrl: '/uploads/checklists/chk-compromiso-r1.pdf',
  pdfGeneratedAt: '2026-10-11T00:00:00.000Z',
  template: { key: 'COMPROMISO_HORARIOS' },
  versions: [],
};

const EVENT = {
  id: 'evt-e2e-aud',
  name: 'SHOW EXPLANADA',
  artist: 'Artista',
  venue: 'Auditorio Arema Explanada',
  city: 'Puebla',
  status: 'ACTIVE',
  entity: 'EXPLANADA',
  campaignType: 'NONE',
  startsAt: '2026-11-16T02:00:00.000Z',
  checklists: [CHECKLIST],
  purchaseOrders: [],
  financeRuns: [],
  campaign: null,
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

const STUBS = {
  '/events/evt-e2e-aud': EVENT,
  '/documents/event/evt-e2e-aud': [],
  '/vendor/event/evt-e2e-aud': [],
  '/checklists/chk-compromiso': CHECKLIST,
};

async function openCompromiso(
  page: import('@playwright/test').Page,
  baseURL: string,
  extra: Record<string, unknown> = {},
) {
  await seedSession(page, baseURL);
  await mockAuthenticatedApi(page, { ...STUBS, ...extra });
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto(`${baseURL}/events/evt-e2e-aud?tab=checklists&checklist=chk-compromiso`);
  await page.locator('.fsheet').waitFor({ timeout: 25000 });
}

/** Un trazo cualquiera sobre el lienzo de firma. */
async function scribble(page: import('@playwright/test').Page, canvas: import('@playwright/test').Locator) {
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(box.x + 20 + i * 14, box.y + box.height * (0.5 + 0.25 * Math.sin(i)));
  }
  await page.mouse.up();
}

test.describe('Formatos del Auditorio', () => {
  test('Compromiso de horarios: condiciones como texto, conceptos completos y firmas de las dos partes', async ({ page, baseURL }) => {
    await openCompromiso(page, baseURL!);
    const sheet = page.locator('.fsheet');

    await expect(sheet.getByRole('heading', { name: 'Compromiso de horarios — Día del show' })).toBeVisible();
    // El texto fijo se lee (viñetas), no es un campo.
    await expect(sheet.locator('.fsheet__para--bullet')).toHaveCount(2);
    await expect(sheet.getByText(CONDICIONES[0])).toBeVisible();
    await expect(sheet.locator('.fsheet__para').last()).toContainText('El Encargado de Producción Externa manifiesta');

    // El concepto largo se ve completo y sigue editable; el renglón libre del Word, vacío.
    const largo = sheet.getByLabel('Concepto, renglón 3', { exact: true });
    await expect(largo).toHaveValue(CONCEPTOS[2]);
    expect(await largo.evaluate((el) => el.tagName)).toBe('TEXTAREA');
    await expect(sheet.getByLabel('Concepto, renglón 4', { exact: true })).toHaveValue('');
    await sheet.getByLabel('Horario comprometido, renglón 1', { exact: true }).fill('08:00');

    // Firmas con el nombre de cada parte.
    const firmas = sheet.locator('.fsheet__sign');
    await expect(firmas).toContainText('Producción externa');
    await expect(firmas).toContainText('Auditorio Explanada Puebla');
    await expect(firmas).not.toContainText('Entregado');

    await page.screenshot({ path: 'e2e/.output/formatos-auditorio-hoja.png', fullPage: true });

    // Modo Lista: el texto fijo también se lee como texto.
    await page.getByRole('tab', { name: 'Lista', exact: true }).click();
    await expect(page.locator('.hub-para').first()).toContainText(CONDICIONES[0]);
  });

  /*
   * Junta del 23-10-2026: «que las firmas vengan abajo inmersas dentro del
   * documento, no hasta arriba» y «en cuanto se termine y se mande se tome
   * como 100 por ciento aunque no se haya palomeado todo».
   */
  test('las firmas van al final del documento, se firma ahí mismo y el formato firmado cuenta 100 %', async ({
    page,
    baseURL,
  }) => {
    let signedAs = '';
    await openCompromiso(page, baseURL!, {
      '/checklists/chk-compromiso/sign': async (route: import('@playwright/test').Route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        signedAs = body.kind;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...CHECKLIST,
            progressPct: 100,
            deliveredAt: '2026-11-15T22:10:00.000Z',
            deliveredSignature: {
              signerName: body.signerName,
              imageDataUrl: body.imageDataUrl,
              signedAt: '2026-11-15T22:10:00.000Z',
            },
          }),
        });
      },
    });
    const sheet = page.locator('.fsheet');

    // Abajo, dentro de la hoja: después de la última sección y antes del pie.
    const firmas = sheet.locator('.fsheet__sign');
    const lastSection = await sheet.locator('.fsheet__sec').last().boundingBox();
    const firmasBox = await firmas.boundingBox();
    const footer = await sheet.locator('.fsheet__foot').boundingBox();
    expect(firmasBox!.y).toBeGreaterThan(lastSection!.y + lastSection!.height - 1);
    expect(firmasBox!.y + firmasBox!.height).toBeLessThanOrEqual(footer!.y + 1);
    // Ningún cajón de firmas arriba del documento.
    await expect(page.locator('.hub-drawer')).toHaveCount(0);

    // Sin firmar: borrador con lo capturado, renglones con el nombre de cada parte.
    await expect(page.locator('.hub-doc__progress')).not.toContainText('mandado');
    await expect(firmas.locator('.fsign__role')).toHaveText(['Producción externa', 'Auditorio Explanada Puebla']);

    // Se firma en el renglón, ahí mismo.
    await firmas.getByRole('button', { name: 'Firmar: Producción externa' }).click();
    const canvas = firmas.locator('.sig-canvas');
    await expect(canvas).toBeVisible();
    await scribble(page, canvas);
    await firmas.getByRole('button', { name: 'Firmar producción externa' }).click();

    await expect(firmas.getByRole('img', { name: 'Firma: Producción externa' })).toBeVisible();
    expect(signedAs).toBe('ENTREGADO');
    await expect(firmas.locator('.fsign__col').first()).toContainText('Ana Robles');
    await expect(firmas.locator('.fsign__col').first()).toContainText('Fecha:');
    // Firmado = mandado: 100 % aunque no se haya llenado todo, y lo capturado sigue a la vista.
    await expect(page.locator('.hub-doc__progress')).toContainText(/100% · mandado · \d+\/\d+ campos/);
    await expect(page.locator('.fsheet-outline__pct')).toHaveText('100%');

    await firmas.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'e2e/.output/formatos-firmas-arta.png', fullPage: true });

    // «Lista»: las firmas también al final, después de la última sección.
    await page.getByRole('tab', { name: 'Lista', exact: true }).click();
    const secciones = page.locator('.hub-sections > section');
    await expect(secciones.last()).toHaveClass(/hub-sec--firmas/);
    await expect(secciones.last().getByRole('img', { name: 'Firma: Producción externa' })).toBeVisible();
  });

  test('Auditorio (tema oscuro): las firmas al final de la hoja, en papel', async ({ page }) => {
    const origin = 'http://auditorio.localhost:' + (process.env.E2E_PORT || '3100');
    await openCompromiso(page, origin, {
      '/checklists/chk-compromiso': {
        ...CHECKLIST,
        status: 'REVIEW',
        progressPct: 100,
      },
    });
    const firmas = page.locator('.fsheet .fsheet__sign');
    await expect(firmas.locator('.fsign__role')).toHaveText(['Producción externa', 'Auditorio Explanada Puebla']);
    // Mandado a revisión: cuenta 100 % aunque falten campos.
    await expect(page.locator('.hub-doc__progress')).toContainText('100% · mandado');
    await firmas.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'e2e/.output/formatos-firmas-auditorio.png', fullPage: true });
  });
});
