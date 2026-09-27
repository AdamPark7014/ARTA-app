import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
import * as XLSX from 'xlsx';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Editores embebidos: el Excel se abre, se escribe encima y al guardar se
 * reemplaza el archivo del evento en el sitio.
 */

function demoWorkbook(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Concepto', 'Monto'],
    ['Audio', 12000],
    ['Luces', 8000],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

const EVENT = {
  id: 'evt-e2e-1',
  name: 'Noche de Bandas',
  artist: 'Los Ecos',
  venue: 'Auditorio Arema',
  city: 'Puebla',
  status: 'ACTIVE',
  entity: 'ARTA',
  campaignType: 'INTERNAL',
  startsAt: '2026-09-20T02:00:00.000Z',
  checklists: [],
  purchaseOrders: [],
  financeRuns: [],
  campaign: null,
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
  tasks: [],
  sponsors: [],
};

test.describe('Editores embebidos', () => {
  test('la hoja de cálculo se abre, se edita y se guarda en el sitio', async ({
    page,
    baseURL,
  }) => {
    type CellChange = { sheet: string; ref: string; value?: unknown; formula?: string };
    const patches: Array<{ cells: CellChange[] }> = [];

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': EVENT,
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
      // El editor ya no reconstruye el libro en el navegador: manda el delta y
      // el servidor lo aplica con ExcelJS sobre el archivo real.
      '/uploads/file-xlsx/cells': (route: Route) => {
        patches.push(JSON.parse(route.request().postData() || '{}'));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'file-xlsx', version: 2, url: '/uploads/demo.xlsx' }),
        });
      },
    });

    // El archivo vive fuera de /api: se sirve un .xlsx real generado aquí.
    await page.route('**/uploads/demo.xlsx', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: demoWorkbook(),
      }),
    );

    await page.goto('/events/evt-e2e-1?tab=files');

    await page.getByRole('button', { name: 'Editar', exact: true }).click();

    // El contenido real del archivo llega a la cuadrícula
    const a1 = page.getByLabel('Celda A1', { exact: true });
    await expect(a1).toHaveValue('Concepto');
    await expect(page.getByLabel('Celda B2', { exact: true })).toHaveValue('12000');

    // Se escribe encima como en Excel
    await page.getByLabel('Celda A4', { exact: true }).fill('Transporte');
    await page.getByLabel('Celda B4', { exact: true }).fill('4500');

    const guardar = page.getByRole('button', { name: 'Guardar', exact: true });
    await expect(guardar).toBeEnabled();
    await guardar.click();

    // Se afirma lo que importa —que el guardado quedó registrado— y no la
    // frase entera, que se ha reescrito ya dos veces por motivos de tono.
    await expect(page.getByText(/edición registrada/i)).toBeVisible();

    // Se mandó UN parche, con exactamente las dos celdas tocadas: ni el libro
    // entero ni celdas que nadie editó.
    expect(patches).toHaveLength(1);
    const cells = patches[0].cells;
    expect(cells).toHaveLength(2);
    expect(cells).toContainEqual({ sheet: 'Presupuesto', ref: 'A4', value: 'Transporte' });
    expect(cells).toContainEqual({ sheet: 'Presupuesto', ref: 'B4', value: 4500 });
  });

  test('un documento nuevo se escribe y se exporta a PDF', async ({ page, baseURL }) => {
    const created = { title: '' };

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': { ...EVENT, files: [] },
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
      '/documents': (route: Route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        created.title = body.title;
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'doc-1',
            title: body.title,
            blocksJson: [{ type: 'p', text: '' }],
            version: 1,
            updatedAt: '2026-08-29T00:00:00.000Z',
          }),
        });
      },
      '/documents/doc-1': (route: Route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'doc-1',
            title: 'Acta de junta',
            blocksJson: JSON.parse(route.request().postData() || '{}').blocks,
            version: 2,
            updatedAt: '2026-08-29T00:00:00.000Z',
          }),
        }),
    });

    await page.goto('/events/evt-e2e-1?tab=files');

    await page.getByRole('button', { name: 'Nuevo documento' }).click();
    expect(created.title).toBe('Documento sin título');

    await page.locator('.docedit__title').fill('Acta de junta');
    await page.locator('.docedit__text').first().fill('Acuerdos de la reunión del 28 de agosto.');

    const guardar = page.getByRole('button', { name: 'Guardar', exact: true });
    await expect(guardar).toBeEnabled();
    await guardar.click();

    await expect(page.getByText(/quedó registrada/i)).toBeVisible();
  });

  test('las fórmulas se recalculan y muestran el valor', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': {
        ...EVENT,
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
      '/uploads/file-xlsx/cells': async (route: Route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'file-xlsx', version: 3, url: '/uploads/demo.xlsx' }),
        }),
    });

    // Libro con fórmula en B4 = B2 + B3
    await page.route('**/uploads/demo.xlsx', (route) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Concepto', 'Monto'],
        ['Audio', 12000],
        ['Luces', 8000],
        ['Total', null],
      ]);
      (ws as any)['B4'] = { t: 'n', f: 'B2+B3' }; // fórmula
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto');
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
      return route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: buf,
      });
    });

    await page.goto('/events/evt-e2e-1?tab=files');
    await page.getByRole('button', { name: 'Editar', exact: true }).click();

    // La celda con fórmula muestra el valor calculado
    await expect(page.getByLabel('Celda B4', { exact: true })).toHaveValue('20000');
    // Cambiar B2 a 15000 → B4 = 23000
    const b2 = page.getByLabel('Celda B2', { exact: true });
    await b2.fill('15000');
    await expect(page.getByLabel('Celda B4', { exact: true })).toHaveValue('23000');
  });
});
