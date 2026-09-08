import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Editar el show desde el propio evento.
 *
 * La fecha y el tipo de campaña solo se podían fijar al **crear** el evento: el
 * API los aceptaba desde siempre, pero el panel nunca los mandaba. Un show que
 * se movía de fecha —que es la mitad de la operación— no tenía arreglo salvo
 * borrarlo y rehacerlo, perdiendo formatos, órdenes, archivos e historial.
 */

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
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

test.describe('Datos del show', () => {
  test('se ven sin entrar en modo edición', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': EVENT,
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
    });
    await page.goto('/events/evt-e2e-1');

    const card = page.locator('.event-facts');
    await expect(card).toContainText('Arta Producciones');
    await expect(card).toContainText('Auditorio Arema');
    // El tipo de campaña no salía en ninguna pantalla, y decide qué precio usa
    // la hoja de gastos.
    await expect(card).toContainText('Interna');
  });

  test('la fecha del show se puede mover, y viaja como instante absoluto', async ({
    page,
    baseURL,
  }) => {
    const patches: Array<Record<string, unknown>> = [];

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': (route: Route) => {
        if (route.request().method() === 'PATCH') {
          patches.push(JSON.parse(route.request().postData() || '{}'));
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(EVENT),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EVENT),
        });
      },
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
    });
    await page.goto('/events/evt-e2e-1');

    await page.getByRole('button', { name: 'Editar datos' }).first().click();
    await page.getByLabel('Empieza').fill('2026-10-03T21:30');
    await page.getByRole('combobox', { name: 'Campaña' }).selectOption('EXTERNAL');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect.poll(() => patches.length).toBeGreaterThan(0);
    const sent = patches[0];
    expect(sent.campaignType).toBe('EXTERNAL');
    // ISO con zona: el servidor ya no tiene nada que interpretar en la suya.
    expect(String(sent.startsAt)).toMatch(/Z$/);
    expect(new Date(String(sent.startsAt)).getHours()).toBe(21);
  });

  test('«Editar datos» desde otra pestaña lleva al formulario, no a la nada', async ({
    page,
    baseURL,
  }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': EVENT,
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
    });
    await page.goto('/events/evt-e2e-1?tab=tasks');

    await page.getByRole('button', { name: 'Editar datos' }).first().click();

    await expect(page.getByLabel('Empieza')).toBeVisible();
    // Resumen es la pestaña por defecto, así que la URL se queda sin `?tab=`.
    await expect(page).not.toHaveURL(/tab=tasks/);
  });

  test('un fin antes del inicio no se guarda', async ({ page, baseURL }) => {
    const patches: Array<Record<string, unknown>> = [];

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': (route: Route) => {
        if (route.request().method() === 'PATCH') patches.push({});
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EVENT),
        });
      },
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
    });
    await page.goto('/events/evt-e2e-1');

    await page.getByRole('button', { name: 'Editar datos' }).first().click();
    await page.getByLabel('Empieza').fill('2026-10-03T21:30');
    await page.getByLabel(/Termina/).fill('2026-10-03T10:00');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByText(/no puede ser antes del inicio/i)).toBeVisible();
    expect(patches).toHaveLength(0);
  });
});

test.describe('Tareas del evento', () => {
  const WITH_TASK = {
    ...EVENT,
    tasks: [
      {
        id: 'tsk-1',
        title: 'Confirmr planta de luz',
        detail: '',
        status: 'OPEN',
        module: 'produccion',
        assigneeId: null,
        dueAt: null,
        createdById: 'usr-e2e-super',
        activities: [],
        evidences: [],
      },
    ],
  };

  test('el texto de una tarea se corrige donde está', async ({ page, baseURL }) => {
    const patches: Array<Record<string, unknown>> = [];

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events/evt-e2e-1': WITH_TASK,
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
      '/tasks/tsk-1': (route: Route) => {
        patches.push(JSON.parse(route.request().postData() || '{}'));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...WITH_TASK.tasks[0], title: 'Confirmar planta de luz' }),
        });
      },
    });
    await page.goto('/events/evt-e2e-1?tab=tasks');

    // `exact` porque la casilla de «hecha» lleva el título dentro de su aria-label.
    await page.getByRole('button', { name: 'Confirmr planta de luz', exact: true }).click();
    await page.getByLabel('Qué hay que hacer').fill('Confirmar planta de luz');
    await page.getByLabel(/Detalle/).fill('Con el proveedor de siempre');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => patches.length).toBeGreaterThan(0);
    expect(patches[0]).toMatchObject({
      title: 'Confirmar planta de luz',
      detail: 'Con el proveedor de siempre',
    });
  });
});
