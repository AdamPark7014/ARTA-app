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

async function openCompromiso(page: import('@playwright/test').Page, baseURL: string) {
  await seedSession(page, baseURL);
  await mockAuthenticatedApi(page, STUBS);
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto('/events/evt-e2e-aud?tab=checklists&checklist=chk-compromiso');
  await page.locator('.fsheet').waitFor({ timeout: 25000 });
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
});
