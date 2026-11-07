import { expect, test, type Page, type Route } from '@playwright/test';

import { mockApi, seedSession, TEST_USER } from './support/mock-api';

/**
 * Adam, 07-11-2026: cada aviso lleva justo a lo que habla, no a una lista general; un evento cerrado
 * o pasado cuenta 100 %, y el riesgo solo sale cerca de la fecha con umbrales que se ajustan.
 */

const CHACHO = { ...TEST_USER, id: 'usr-dir', fullName: 'José Luis Arista', roleKey: 'dir_general', entities: ['ARTA', 'EXPLANADA'], permissions: [] };

function checklist(id: string, title: string, progressPct = 40) {
  return { id, title, status: 'DRAFT', progressPct, template: { id: `tpl-${id}`, key: 'EVENTO_GENERAL' }, dataJson: { sections: [] }, versions: [], signatures: [] };
}

function po(id: string, status: string, vendorName: string) {
  return { id, rubro: 'audio', vendorName, amount: 12000, status, paymentMethod: 'TRANSFERENCIA', lines: [], proofs: [], createdAt: '2026-11-01T00:00:00.000Z' };
}

const EVENT = {
  id: 'evt-1',
  name: 'Noche de Bandas',
  artist: 'Los Ecos',
  venue: 'Auditorio Arema',
  city: 'Puebla',
  status: 'ACTIVE',
  entity: 'ARTA',
  campaignType: 'INTERNAL',
  startsAt: '2030-12-20T02:00:00.000Z',
  checklists: [checklist('cl-1', 'Checklist Evento General'), checklist('cl-2', 'Transportación'), checklist('cl-3', 'Catering', 100)],
  purchaseOrders: [po('po-auth', 'PENDING_AUTH', 'Audio Puebla'), po('po-paid', 'PAID', 'Luces del Valle')],
  financeRuns: [],
  campaign: null,
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

async function openEvent(page: Page, baseURL: string, query: string, over: Record<string, unknown> = {}) {
  const event = { ...EVENT, ...over };
  await seedSession(page, baseURL);
  await mockApi(page, {
    '/auth/me': { user: CHACHO },
    '/events/evt-1': event,
    '/documents/event/evt-1': [],
    '/vendor/event/evt-1': [],
    '/testigos/event/evt-1': [],
  } as never);
  await page.goto(`/events/evt-1${query}`);
  await expect(page.getByRole('heading', { name: 'Noche de Bandas' }).first()).toBeVisible();
}

test.describe('Cada aviso abre lo suyo', () => {
  test('la OC del aviso se abre dentro de su evento, aunque no esté por autorizar', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, '?tab=ocs&po=po-paid');
    const row = page.locator('#po-po-paid');
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/is-open/);
    await expect(page.locator('#po-po-auth')).not.toHaveClass(/is-open/);
  });

  test('el aviso de riesgo abre los formatos por completar', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, '?tab=checklists&ver=pendientes');
    await expect(page.getByRole('tab', { name: /Por completar/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /Todos/ })).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByText('Checklist Evento General')).toBeVisible();
  });

  test('un evento cerrado no deja nada «por completar»', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, '?tab=checklists', { status: 'CLOSED' });
    const todo = page.getByRole('tab', { name: /Por completar/ });
    if (await todo.count()) await expect(todo).toContainText('0');
    await expect(page.getByRole('tab', { name: /Listos/ })).toContainText('3');
  });

  test('un evento que ya pasó cuenta 100 % al abrir su formato', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, '?tab=checklists&checklist=cl-1', { startsAt: '2026-01-10T02:00:00.000Z' });
    await expect(page.getByText(/100\s?%/).first()).toBeVisible();
  });

  test('la nota del calendario abre su mes con el día marcado', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: CHACHO } } as never);
    await page.goto('/calendar?date=2030-03-14');
    await expect(page.locator('[data-day="2030-03-14"]')).toHaveClass(/is-focus/);
    await expect(page.getByText(/marzo de 2030/i)).toBeVisible();
  });
});

test.describe('Umbrales de riesgo', () => {
  test('dirección los ajusta en Organización y se guardan validados', async ({ page, baseURL }) => {
    const patches: unknown[] = [];
    await seedSession(page, baseURL!);
    await mockApi(page, {
      '/auth/me': { user: { ...CHACHO, roleKey: 'super_admin', permissions: ['everything'] } },
      '/organizations/me': { id: 'org-1', slug: 'arta', name: 'Arta', plan: 'ENTERPRISE', active: true, settingsJson: {}, _count: { users: 3, events: 2, memberships: 3 } },
      '/organizations/org-1': async (route: Route) => {
        if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON());
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      },
    } as never);
    await page.goto('/organizations');
    const form = page.locator('form.org-risk');
    await expect(form).toBeVisible();
    await form.getByLabel('En riesgo: días o menos para el evento').fill('10');
    await form.getByLabel('Por revisar: avance mínimo en porcentaje').fill('70');
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ riesgo: { urgente: { dias: 10, minimo: 80 }, revisar: { dias: 14, minimo: 70 } } });
  });
});
