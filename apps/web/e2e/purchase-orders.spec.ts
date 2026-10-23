import { expect, test } from '@playwright/test';

import { mockAuthenticatedApi, seedSession, TEST_OVERVIEW } from './support/mock-api';

/**
 * Órdenes de compra: en efectivo no hay comprobante.
 *
 * Lo que pidió Arta, literal: «que solo se pida comprobante cuando no es en
 * efectivo, en efectivo no hay». Y lo que hacía falta para que se entendiera:
 * el panel enseñaba «Marcar pagado» apagado con el motivo metido en un `title`
 * —que el navegador no muestra en botones deshabilitados—, así que quedaba un
 * botón muerto sin ninguna explicación.
 */

const BASE_EVENT = {
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
  financeRuns: [],
  campaign: null,
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

function po(over: Record<string, unknown>) {
  return {
    id: 'po-1',
    rubro: 'audio',
    vendorName: 'Audio Puebla',
    description: 'Consola y monitores',
    amount: 18000,
    status: 'AUTHORIZED',
    paymentMethod: 'TRANSFERENCIA',
    lines: [{ id: 'l1', concept: 'Consola', qty: 1, unitPrice: 18000, total: 18000 }],
    proofs: [],
    ...over,
  };
}

async function openOcs(
  page: import('@playwright/test').Page,
  baseURL: string,
  orders: Array<Record<string, unknown>>,
) {
  await seedSession(page, baseURL);
  await mockAuthenticatedApi(page, {
    '/events/evt-e2e-1': { ...BASE_EVENT, purchaseOrders: orders },
    '/documents/event/evt-e2e-1': [],
    '/vendor/event/evt-e2e-1': [],
  });
  await page.goto('/events/evt-e2e-1?tab=ocs');
}

test.describe('Órdenes de compra · el comprobante', () => {
  // Junta 23-10-2026: el estado dice qué falta («Autorizada · sin comprobante»),
  // no solo «Por pagar». Sin `state` del API, el panel lo arma con el estatus.
  test('en efectivo no se pide comprobante y se puede pagar', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, [po({ paymentMethod: 'EFECTIVO' })]);

    await expect(page.getByRole('cell', { name: 'Autorizada · sin pagar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar pagada' })).toBeEnabled();
  });

  test('por transferencia sin comprobante NO se puede pagar, y se dice por qué', async ({
    page,
    baseURL,
  }) => {
    await openOcs(page, baseURL!, [po({ paymentMethod: 'TRANSFERENCIA' })]);

    await expect(page.getByRole('cell', { name: 'Autorizada · sin comprobante' })).toBeVisible();
    // El botón no está: antes estaba deshabilitado y sin motivo a la vista.
    await expect(page.getByRole('button', { name: 'Marcar pagada' })).toHaveCount(0);
    // Al abrirla, el detalle dice qué falta y qué hacer.
    await page.getByRole('button', { name: 'Comprobante' }).click();
    await expect(page.getByText(/Falta el comprobante: súbelo/i)).toBeVisible();
  });

  test('con el comprobante arriba ya se puede pagar', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, [
      po({
        paymentMethod: 'TRANSFERENCIA',
        proofs: [{ id: 'pf-1', fileUrl: '/uploads/spei.pdf', label: 'SPEI', amount: 18000 }],
      }),
    ]);

    await expect(page.getByRole('cell', { name: 'Autorizada · sin pagar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar pagada' })).toBeEnabled();
  });

  test('mientras no la autoricen, la orden espera', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, [po({ status: 'PENDING_AUTH' })]);

    await expect(page.getByRole('cell', { name: 'Sin autorizar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar pagada' })).toHaveCount(0);
  });

  test('el texto del API manda: fuera de día de cobro se dice tal cual', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, [
      po({
        paymentMethod: 'EFECTIVO',
        state: {
          key: 'off_pay_day',
          label: 'Fuera de día de cobro',
          missing: 'Se paga mañana',
          hint: 'Lista para pagar. En efectivo no se pide comprobante; hoy no es día de cobro: se marca pagada mañana.',
          tone: 'waiting',
          section: 'pay',
        },
      }),
    ]);

    await expect(page.getByRole('cell', { name: 'Fuera de día de cobro' })).toBeVisible();
  });

  test('chips por estado con su cuenta, y filtran', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, [
      po({ id: 'po-1', vendorName: 'Audio Puebla', paymentMethod: 'TRANSFERENCIA' }),
      po({ id: 'po-2', vendorName: 'Luces Centro', paymentMethod: 'TRANSFERENCIA' }),
      po({
        id: 'po-3',
        vendorName: 'Catering Sol',
        paymentMethod: 'TRANSFERENCIA',
        proofs: [{ id: 'pf-1', fileUrl: '/uploads/spei.pdf', label: 'SPEI', amount: 18000 }],
      }),
    ]);

    const chips = page.getByRole('group', { name: 'Filtrar por lo que le falta' });
    await expect(chips.getByRole('button', { name: /Autorizada · sin comprobante\s*2/ })).toBeVisible();
    await chips.getByRole('button', { name: /Autorizada · sin pagar\s*1/ }).click();
    await expect(page.getByRole('button', { name: /^Catering Sol/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Audio Puebla/ })).toHaveCount(0);
  });
});

test.describe('Órdenes de compra · torre', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'po-1',
    eventId: 'evt-e2e-1',
    eventName: 'Noche de Bandas',
    eventStatus: 'ACTIVE',
    rubro: 'audio',
    vendorName: 'Audio Puebla',
    paymentMethod: 'TRANSFERENCIA',
    proofCount: 0,
    status: 'AUTHORIZED',
    amount: 18000,
    ageDays: 2,
    ...over,
  });

  test('?estado= abre la torre filtrada por lo que falta', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/analytics/purchase-orders': {
        orders: [
          row({ id: 'po-1', vendorName: 'Audio Puebla' }),
          row({ id: 'po-2', vendorName: 'Luces Centro', proofCount: 1 }),
          row({ id: 'po-3', vendorName: 'Catering Sol', status: 'PENDING_AUTH' }),
        ],
      },
    });
    await page.goto('/purchase-orders?estado=no_proof');

    await expect(page.getByRole('button', { name: /Autorizada · sin comprobante\s*1/, pressed: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Audio Puebla/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Luces Centro/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Catering Sol/ })).toHaveCount(0);
  });
});

test.describe('Órdenes de compra · crear', () => {
  test('el formulario vacío no crea una OC de $0, y dice qué falta', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, []);

    const crear = page.getByRole('button', { name: /Crear orden de compra/ });
    await expect(crear).toBeDisabled();
    await expect(page.getByText(/Escribe al menos un concepto/i)).toBeVisible();
  });

  test('con concepto e importe se habilita, y el botón dice cuánto', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, []);

    // Por nombre accesible y no por `placeholder`: el texto de ayuda ya cambió
    // una vez y dejó la prueba roja sin que nada se hubiera roto.
    await page.getByLabel('Concepto de la partida 1').fill('Consola');
    await page.getByLabel('Cantidad de Consola').fill('2');
    await page.getByLabel('Precio unitario de Consola').fill('7500');

    await expect(page.getByRole('button', { name: /Crear orden de compra por/ })).toBeEnabled();
  });

  test('elegir efectivo avisa que no habrá comprobante', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, []);

    await expect(page.getByText(/al liquidar se pedirá/i)).toBeVisible();

    await page.getByLabel('Forma de pago').selectOption('EFECTIVO');
    await expect(page.getByText(/no se pide comprobante/i).first()).toBeVisible();
  });
});

test.describe('Órdenes de compra · inicio', () => {
  test('«Esperan tu visto bueno» trae una fila por lo que falta y lleva a la torre filtrada', async ({
    page,
    baseURL,
  }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/analytics/overview': {
        ...TEST_OVERVIEW,
        poStates: [
          { key: 'unauthorized', count: 2, amount: 54000, over7: 1, oldestDays: 9 },
          { key: 'no_proof', count: 1, amount: 18000, over7: 0, oldestDays: 2 },
          { key: 'complete', count: 3, amount: 64000, over7: 0, oldestDays: 20 },
        ],
      },
    });
    await page.goto('/dashboard');

    const panel = page.locator('section[aria-labelledby="home-approvals"]');
    await expect(panel.getByRole('link', { name: /OC sin autorizar/ })).toHaveAttribute(
      'href',
      '/purchase-orders?estado=unauthorized',
    );
    await expect(panel.getByRole('link', { name: /OC autorizadas sin comprobante/ })).toBeVisible();
    await expect(panel.getByText('2 órdenes · 1 con más de 7 días')).toBeVisible();
    // Lo pagado y completo no espera a nadie.
    await expect(panel.getByText(/completa/i)).toHaveCount(0);
    await expect(page.getByText('2 sin autorizar · 1 sin comprobante')).toBeVisible();
  });
});
