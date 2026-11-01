import { expect, test, type Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Acuse de visto: al abrir la campana, lo que está a la vista queda visto y a quien lo
 * mandó le llega el aviso. En «Enviados» se ve quién ya lo vio (docs/AVISOS.md § Acuse).
 */

const fulfill = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const notice = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  type: 'task.assigned',
  title: 'Ana R. te asignó: Cotizar luces',
  linkUrl: '/tasks?task=t1',
  readAt: null,
  seenAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

function seenRecorder() {
  const calls: unknown[] = [];
  return {
    calls,
    stub: (route: Route) => {
      calls.push(route.request().postDataJSON());
      return fulfill(route, { seen: 1 });
    },
  };
}

test.describe('Acuse de visto', () => {
  test('tener avisos no cuenta: se ven al abrir la campana, una sola vez', async ({ page, baseURL }) => {
    const seen = seenRecorder();
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications/unread-count': { count: 2 },
      '/notifications': [notice(), notice({ id: 'n2', title: 'Ana R. te mencionó', seenAt: new Date().toISOString() })],
      '/notifications/seen': seen.stub,
    });
    await page.goto('/dashboard');
    const bell = page.getByRole('button', { name: /Avisos \(2 sin leer\)/ });
    await expect(bell).toBeVisible();
    // Solo cargar el panel, con la campana cerrada, no marca nada.
    await page.waitForTimeout(400);
    expect(seen.calls).toEqual([]);

    await bell.click();
    await expect(page.locator('.notif-panel').getByText('Cotizar luces')).toBeVisible();
    await expect.poll(() => seen.calls).toEqual([{ ids: ['n1'] }]);

    await page.keyboard.press('Escape');
    await bell.click();
    await expect(page.locator('.notif-panel')).toBeVisible();
    await page.waitForTimeout(300);
    expect(seen.calls).toHaveLength(1);
  });

  test('la pantalla de Avisos cuenta como abrir la campana', async ({ page, baseURL }) => {
    const seen = seenRecorder();
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, { '/notifications': [notice()], '/notifications/seen': seen.stub });
    await page.goto('/notifications');
    await expect.poll(() => seen.calls).toEqual([{ ids: ['n1'] }]);
  });

  test('si falla por falta de red se vuelve a intentar', async ({ page, baseURL }) => {
    const calls: unknown[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications/unread-count': { count: 1 },
      '/notifications': [notice()],
      '/notifications/seen': (route: Route) => {
        calls.push(1);
        return calls.length === 1
          ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
          : fulfill(route, { seen: 1 });
      },
    });
    await page.goto('/dashboard');
    const bell = page.getByRole('button', { name: /Avisos \(1 sin leer\)/ });
    await bell.click();
    await expect.poll(() => calls.length).toBe(1);
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await bell.click();
    await expect.poll(() => calls.length).toBe(2);
  });

  test('Enviados dice quién ya lo vio y quién no, y no marca nada como visto', async ({ page, baseURL }) => {
    const seen = seenRecorder();
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications': [notice()],
      '/notifications/seen': seen.stub,
      '/notifications/sent': [
        {
          key: 'a',
          type: 'task.assigned',
          title: 'Te asigné: Cotizar luces',
          linkUrl: '/tasks?task=t1',
          createdAt: new Date(Date.now() - 3_600_000).toISOString(),
          recipients: [
            { id: 'u1', fullName: 'Beto Soto', seenAt: new Date(Date.now() - 300_000).toISOString(), readAt: null },
            { id: 'u2', fullName: 'Luis Peña', seenAt: null, readAt: null },
          ],
        },
        {
          key: 'b',
          type: 'chat.mention',
          title: 'Te mencioné en #general',
          linkUrl: null,
          createdAt: new Date().toISOString(),
          recipients: [{ id: 'u1', fullName: 'Beto Soto', seenAt: null, readAt: new Date().toISOString() }],
        },
      ],
    });
    await page.goto('/notifications?tab=enviados');
    const rows = page.locator('.sent-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Visto por 1 de 2');
    await expect(rows.first().locator('li', { hasText: 'Beto Soto' })).toContainText('Visto hace 5 min');
    await expect(rows.first().locator('li', { hasText: 'Luis Peña' })).toContainText('Sin ver');
    // Tocarlo también cuenta como verlo: lo hace el servidor en las apps instaladas.
    await expect(rows.nth(1)).toContainText('Visto');
    await expect(page.getByRole('tab', { name: 'Enviados' })).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(300);
    expect(seen.calls).toEqual([]);
  });

  test('el acuse se ve como aviso normal y no pide nada', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications': [notice({ id: 'r1', type: 'notice.seen', title: 'Beto S. ya vio tu aviso', body: 'Ana R. te asignó: Cotizar luces', targetKind: 'task', targetId: 't1' })],
      '/notifications/seen': { seen: 0 },
    });
    await page.goto('/notifications');
    const row = page.locator('.nt-row', { hasText: 'ya vio tu aviso' });
    await expect(row).toBeVisible();
    await expect(row.locator('.nt-row__act')).toHaveCount(0);
  });
});
