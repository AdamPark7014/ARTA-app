import { expect, test } from '@playwright/test';

import { mockAuthenticatedApi, seedSession, TEST_USER } from './support/mock-api';

/**
 * Adam, 07-11-2026: cada cifra y fila del inicio abre justo lo que dice —el filtro de tareas, la
 * sección de la torre de OC o los eventos con formatos por autorizar—, no una lista general.
 */

const ME = TEST_USER.id;

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Cotizar luces',
  status: 'OPEN',
  dueAt: '2026-01-10T00:00:00.000Z',
  assigneeId: ME,
  assigneeIds: [ME],
  assignees: [{ id: ME, fullName: TEST_USER.fullName }],
  createdById: ME,
  createdBy: { id: ME, fullName: TEST_USER.fullName },
  event: null,
  evidences: [],
  activities: [],
  ...over,
});

const poRow = (over: Record<string, unknown> = {}) => ({
  id: 'po-1',
  eventId: 'evt-e2e-1',
  eventName: 'Noche de Bandas',
  eventStatus: 'ACTIVE',
  rubro: 'audio',
  vendorName: 'Audio Puebla',
  paymentMethod: 'TRANSFERENCIA',
  proofCount: 1,
  status: 'AUTHORIZED',
  amount: 18000,
  ageDays: 2,
  ...over,
});

const event = (over: Record<string, unknown> = {}) => ({
  id: 'evt-a',
  name: 'Noche de Bandas',
  artist: 'Los Ecos',
  venue: 'Auditorio Arema',
  city: 'Puebla',
  status: 'ACTIVE',
  startsAt: '2030-12-20T02:00:00.000Z',
  updatedAt: '2026-11-01T18:00:00.000Z',
  pendingAuthorizedChecklists: 0,
  ...over,
});

test.describe('Cada cifra del inicio abre lo suyo', () => {
  test('/tasks?filtro=vencidas&vista=equipo manda sobre lo recordado: chip «Vencidas» y vista del equipo', async ({ page, baseURL }) => {
    // Lo que la persona dejó elegido la última vez; la liga del inicio debe pisarlo.
    await page.addInitScript(() => {
      localStorage.setItem('arta.ui.tasks.quick', JSON.stringify('open'));
      localStorage.setItem('arta.ui.tasks.view', JSON.stringify('mine'));
      localStorage.setItem('arta.ui.tasks.layout', JSON.stringify('list'));
    });
    await seedSession(page, baseURL!);
    const rows = [task(), task({ id: 't2', title: 'Rider de audio', dueAt: '2030-01-10T00:00:00.000Z' })];
    await mockAuthenticatedApi(page, { '/tasks/mine': rows, '/tasks/requested': rows, '/tasks/workload': rows });
    await page.goto('/tasks?filtro=vencidas&vista=equipo');

    await expect(page.getByRole('tab', { name: 'Todas las tareas' })).toHaveAttribute('aria-selected', 'true');
    const chips = page.getByRole('group', { name: 'Filtro rápido' });
    await expect(chips.getByRole('button', { name: /^Vencidas/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(chips.getByRole('button', { name: /^Pendientes/ })).toHaveAttribute('aria-pressed', 'false');
    // Solo la vencida queda en la lista; el título abre la tarea arriba.
    await expect(page.getByRole('button', { name: 'Abrir Cotizar luces' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir Rider de audio' })).toHaveCount(0);
  });

  test('/tasks?nueva=1 deja el alta abierta con el cursor en el título', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, { '/tasks/mine': [], '/tasks/requested': [], '/tasks/workload': [] });
    await page.goto('/tasks?nueva=1');
    await expect(page.getByRole('textbox', { name: 'Tarea', exact: true })).toBeFocused();
    await expect(page.locator('.composer')).toHaveClass(/is-open/);
  });

  test('/purchase-orders?seccion=pay abre la torre en «Por pagar» aunque haya algo por autorizar', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/analytics/purchase-orders': {
        orders: [poRow({ id: 'po-1', vendorName: 'Audio Puebla' }), poRow({ id: 'po-2', vendorName: 'Catering Sol', status: 'PENDING_AUTH' })],
      },
    });
    await page.goto('/purchase-orders?seccion=pay');

    await expect(page.getByRole('tab', { name: /^Por pagar/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /^Por autorizar/ })).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('button', { name: /^Audio Puebla/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Catering Sol/ })).toHaveCount(0);
    // La liga del evento abre esa orden dentro de su evento.
    await expect(page.getByRole('link', { name: 'Noche de Bandas' })).toHaveAttribute('href', '/events/evt-e2e-1?tab=ocs&po=po-1');
  });

  test('/events?scope=active&ver=revision deja solo los eventos con formatos por autorizar', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/events': [
        event({ id: 'evt-a', name: 'Noche de Bandas', pendingAuthorizedChecklists: 2 }),
        event({ id: 'evt-b', name: 'Festival Explanada' }),
        event({ id: 'evt-c', name: 'Gala de Cierre', pendingAuthorizedChecklists: 1 }),
      ],
    });
    await page.goto('/events?scope=active&ver=revision');

    await expect(page.getByRole('heading', { name: 'Formatos por autorizar' }).first()).toBeVisible();
    const grid = page.locator('.ev-grid');
    await expect(grid.getByRole('link')).toHaveCount(2);
    const card = grid.getByRole('link', { name: /Noche de Bandas/ });
    await expect(card).toContainText('2 por autorizar');
    await expect(card).toHaveAttribute('href', '/events/evt-a?tab=checklists&ver=revision');
    await expect(grid.getByText('Festival Explanada')).toHaveCount(0);
  });

  test('sin formatos por autorizar lo dice y regresa a los eventos actuales', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, { '/events': [event({ id: 'evt-b', name: 'Festival Explanada' })] });
    await page.goto('/events?scope=active&ver=revision');

    await expect(page.getByText('Nada espera autorización')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver eventos actuales' })).toHaveAttribute('href', '/events?scope=active');
    await expect(page.locator('.ev-grid')).toHaveCount(0);
  });
});
