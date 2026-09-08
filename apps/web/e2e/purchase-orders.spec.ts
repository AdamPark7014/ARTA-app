import { expect, test } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

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
  test('en efectivo no se pide comprobante y se puede pagar', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, [po({ paymentMethod: 'EFECTIVO' })]);

    await expect(page.getByText('Lista para pagar')).toBeVisible();
    await expect(page.getByText(/En efectivo no se pide comprobante/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar pagada' })).toBeEnabled();
  });

  test('por transferencia sin comprobante NO se puede pagar, y se dice por qué', async ({
    page,
    baseURL,
  }) => {
    await openOcs(page, baseURL!, [po({ paymentMethod: 'TRANSFERENCIA' })]);

    await expect(page.getByText('Falta el comprobante')).toBeVisible();
    await expect(page.getByText(/sube el comprobante/i)).toBeVisible();
    // El botón no está: antes estaba deshabilitado y sin motivo a la vista.
    await expect(page.getByRole('button', { name: 'Marcar pagada' })).toHaveCount(0);
  });

  test('con el comprobante arriba ya se puede pagar', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, [
      po({
        paymentMethod: 'TRANSFERENCIA',
        proofs: [{ id: 'pf-1', fileUrl: '/uploads/spei.pdf', label: 'SPEI', amount: 18000 }],
      }),
    ]);

    await expect(page.getByText('Lista para pagar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar pagada' })).toBeEnabled();
  });

  test('mientras no la autoricen, la orden espera', async ({ page, baseURL }) => {
    await openOcs(page, baseURL!, [po({ status: 'PENDING_AUTH' })]);

    await expect(page.getByText('Falta autorizar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar pagada' })).toHaveCount(0);
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
