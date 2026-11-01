import { expect, test, type Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession, TEST_USER } from './support/mock-api';

/**
 * Tablero de tareas, el buscador que encuentra tareas y OC, el botón directo de
 * los avisos y los atajos del teclado.
 */

const ME = TEST_USER.id;

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Cotizar luces',
  status: 'OPEN',
  assigneeId: ME,
  assigneeIds: [ME],
  assignees: [{ id: ME, fullName: TEST_USER.fullName }],
  createdById: ME,
  createdBy: { id: ME, fullName: TEST_USER.fullName },
  event: { id: 'e1', name: 'Noche de Boleros', status: 'ACTIVE' },
  evidences: [],
  activities: [],
  ...over,
});

const fulfill = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('Tareas · tablero', () => {
  async function open(page: import('@playwright/test').Page, baseURL: string | undefined, rows: unknown[], extra = {}) {
    await page.addInitScript(() => localStorage.setItem('tasks.layout', JSON.stringify('board')));
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, { '/tasks/mine': rows, '/tasks/requested': rows, '/tasks/workload': rows, ...extra });
    await page.goto('/tasks');
  }

  test('reparte por estado y mueve con «Mover a»', async ({ page, baseURL }) => {
    const moved: unknown[] = [];
    await open(page, baseURL, [task(), task({ id: 't2', title: 'Rider de audio', status: 'IN_PROGRESS' }), task({ id: 't3', title: 'Lona', status: 'DONE' })], {
      '/tasks/t1': (route: Route) => {
        moved.push(route.request().postDataJSON());
        return fulfill(route, task({ status: 'IN_PROGRESS' }));
      },
    });
    await page.getByRole('button', { name: 'Tablero' }).click();
    const pending = page.getByRole('listitem', { name: 'Pendientes: 1' });
    await expect(pending.getByText('Cotizar luces')).toBeVisible();
    await expect(page.getByRole('listitem', { name: 'En curso: 1' }).getByText('Rider de audio')).toBeVisible();
    // Lo terminado también se ve: el tablero no usa el filtro de pendientes.
    await expect(page.getByRole('listitem', { name: 'Hechas: 1' }).getByText('Lona')).toBeVisible();

    await pending.getByRole('combobox', { name: 'Mover Cotizar luces' }).selectOption('IN_PROGRESS');
    await expect.poll(() => moved).toEqual([{ status: 'IN_PROGRESS' }]);
    await expect(page.getByRole('listitem', { name: 'En curso: 2' })).toBeVisible();
  });

  test('terminar lo que alguien más pidió abre la entrega, no la cierra', async ({ page, baseURL }) => {
    await open(page, baseURL, [task({ createdById: 'u-beto', createdBy: { id: 'u-beto', fullName: 'Beto' } })]);
    await page.getByRole('button', { name: 'Tablero' }).click();
    await page.getByRole('combobox', { name: 'Mover Cotizar luces' }).selectOption('DONE');
    await expect(page.locator('.modal').getByRole('heading', { name: 'Entregar tarea' })).toBeVisible();
  });

  test('tocar una tarjeta abre esa tarea', async ({ page, baseURL }) => {
    await open(page, baseURL, [task()], { '/tasks/t1': task() });
    await page.getByRole('button', { name: 'Tablero' }).click();
    await page.getByRole('button', { name: /Cotizar luces/ }).click();
    await expect(page).toHaveURL(/\/tasks\?task=t1/);
    await expect(page.getByRole('region', { name: 'Tarea Cotizar luces' })).toBeVisible();
  });
});

test.describe('Tareas · filtros', () => {
  test('los mosaicos filtran y cuentan, sin un segundo juego de botones', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/tasks/mine': [task(), task({ id: 't2', title: 'Rider de audio', status: 'BLOCKED' }), task({ id: 't3', title: 'Lona', status: 'DONE' })],
    });
    await page.goto('/tasks');
    await expect(page.getByRole('button', { name: /^Todas 3$/ })).toBeVisible();
    await page.getByRole('button', { name: /^Bloqueadas 1$/ }).click();
    await expect(page.getByText('Rider de audio')).toBeVisible();
    await expect(page.getByText('Cotizar luces')).toHaveCount(0);
    await page.getByRole('button', { name: /^Hechas 1$/ }).click();
    await expect(page.getByText('Lona')).toBeVisible();
  });
});

test('el buscador encuentra tareas y OC con su estado, y sin escribir enseña tus tareas', async ({ page, baseURL }) => {
  const asked: string[] = [];
  await seedSession(page, baseURL!);
  await mockAuthenticatedApi(page, {
    '/chat/refs/search': (route: Route) => {
      const url = new URL(route.request().url());
      asked.push(url.search);
      return fulfill(route, {
        results: url.searchParams.get('q')
          ? [
              { kind: 'po', id: 'p1', label: 'OC 4F2A9C', title: 'OC 4F2A9C', href: '/purchase-orders?po=p1', statusLabel: 'Por autorizar', amount: '$37,700', subtitle: 'Sonido Quetzal' },
            ]
          : [{ kind: 'task', id: 't1', label: 'Cotizar luces', title: 'Cotizar luces', href: '/tasks?task=t1', statusLabel: 'Pendiente' }],
      });
    },
  });
  await page.goto('/dashboard');
  const box = page.getByRole('combobox', { name: 'Buscar en ARTA' });
  await box.focus();
  await expect(page.getByText('Tus tareas')).toBeVisible();
  await expect(page.getByRole('option', { name: /Cotizar luces/ })).toBeVisible();

  await box.fill('quetzal');
  const option = page.getByRole('option', { name: /OC 4F2A9C/ });
  await expect(option).toContainText('$37,700');
  await expect(page.getByRole('listbox', { name: 'Resultados' }).getByText('Órdenes de compra')).toBeVisible();
  await box.press('Enter');
  await expect(page).toHaveURL(/\/purchase-orders\?po=p1/);
  expect(asked.some((q) => q.includes('kinds=task%2Cpo%2Cformat%2Cdoc%2Cadvance'))).toBe(true);
});

test('un aviso que espera algo trae su botón y lleva directo a hacerlo', async ({ page, baseURL }) => {
  await seedSession(page, baseURL!);
  await mockAuthenticatedApi(page, {
    '/notifications/unread-count': { count: 2 },
    '/notifications': [
      {
        id: 'n1',
        type: 'task.assigned',
        title: 'Ana R. te asignó: Cotizar luces',
        linkUrl: '/tasks?task=t1',
        targetKind: 'task',
        targetId: 't1',
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'n2',
        type: 'file.uploaded',
        title: 'Ana R. subió un archivo',
        linkUrl: '/events/e1?tab=files',
        targetKind: 'event',
        targetId: 'e1',
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ],
    '/tasks/mine': [],
    '/tasks/t1': task({ createdById: 'u-beto' }),
  });
  await page.goto('/notifications');
  const rows = page.locator('.nt-row');
  await expect(rows.filter({ hasText: 'Ana R. subió' }).locator('.nt-row__act')).toHaveCount(0);
  await rows.filter({ hasText: 'te asignó' }).getByRole('button', { name: 'Entregar' }).click();
  await expect(page).toHaveURL(/\/tasks\?task=t1&do=deliver/);
  await expect(page.locator('.modal').getByRole('heading', { name: 'Entregar tarea' })).toBeVisible();
});

test.describe('Atajos del teclado', () => {
  test('? los enseña; g + letra lleva a la pantalla; dentro de un campo no estorban', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('combobox', { name: 'Buscar en ARTA' })).toBeVisible();

    // El servidor pinta antes de que el panel escuche el teclado.
    const help = page.getByRole('dialog', { name: 'Atajos del teclado' });
    await expect(async () => {
      await page.keyboard.press('?');
      await expect(help).toBeVisible({ timeout: 500 });
    }).toPass();
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);

    await page.getByRole('combobox', { name: 'Buscar en ARTA' }).focus();
    await page.keyboard.type('g');
    await page.keyboard.type('t');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.keyboard.press('Escape');

    await page.locator('body').click({ position: { x: 5, y: 500 } });
    await page.keyboard.press('g');
    await page.keyboard.press('t');
    await expect(page).toHaveURL(/\/tasks/);
  });
});
