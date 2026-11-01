import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Editar el show desde el propio evento.
 *
 * La fecha solo se podía fijar al **crear** el evento: el API la aceptaba desde
 * siempre, pero el panel nunca la mandaba. Un show que se movía de fecha —que es
 * la mitad de la operación— no tenía arreglo salvo borrarlo y rehacerlo, perdiendo
 * formatos, órdenes, archivos e historial.
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

    const card = page.locator('.ev-facts');
    await expect(card).toContainText('Arta Producciones');
    await expect(card).toContainText('Auditorio Arema');
    await expect(card).toContainText('Fecha del evento');
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
    await page.getByLabel('Fecha del evento').fill('2026-10-03');
    await page.getByLabel('Horario').fill('21:30');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => patches.length).toBeGreaterThan(0);
    const sent = patches[0];
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

    await expect(page.getByLabel('Fecha del evento')).toBeVisible();
    // Resumen es la pestaña por defecto, así que la URL se queda sin `?tab=`.
    await expect(page).not.toHaveURL(/tab=tasks/);
  });

  test('un último día antes de la fecha no se guarda', async ({ page, baseURL }) => {
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
    await page.getByLabel('Fecha del evento').fill('2026-10-03');
    // «Último día» aparece con más de una función: es lo que hace un show de varios días.
    await page.getByLabel('Funciones').fill('2');
    await page.getByLabel(/Último día/).fill('2026-10-01');

    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
    await expect(page.getByText(/no puede ser antes de la fecha/i)).toBeVisible();
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

    // Se abre la tarea (el renglón lleva título y responsable) y ahí se corrige.
    await page.getByRole('button', { name: /^Confirmr planta de luz/ }).click();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    const form = page.locator('li', { has: page.getByRole('button', { name: 'Cancelar' }) });
    await form.getByLabel('Qué hay que hacer').fill('Confirmar planta de luz');
    await form.getByLabel(/Detalle/).fill('Con el proveedor de siempre');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => patches.length).toBeGreaterThan(0);
    expect(patches[0]).toMatchObject({
      title: 'Confirmar planta de luz',
      detail: 'Con el proveedor de siempre',
    });
  });
});
