import { expect, test, type Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession } from './support/mock-api';

/**
 * Los avisos dentro del panel: la campana, la pantalla de Avisos, llegar tocando
 * un aviso del sistema y qué llega al teléfono.
 */

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const NOTICES = [
  {
    id: 'n-oc',
    type: 'po.requested',
    title: 'Mateo R. pide autorizar la OC 4F2A9C',
    body: 'Sonido Quetzal Pro · $37,700 · Noche de Boleros. Autorízala o recházala.',
    linkUrl: '/events/evt-e2e-1?tab=ocs',
    readAt: null,
    createdAt: minutesAgo(5),
    entity: 'ARTA',
  },
  {
    id: 'n-doc',
    type: 'file.uploaded',
    title: 'Ana R. subió 3 archivos',
    body: 'Último: rider.pdf · Noche de Boleros',
    linkUrl: '/events/evt-e2e-1?tab=files',
    readAt: null,
    createdAt: minutesAgo(30),
    entity: 'ARTA',
  },
  {
    id: 'n-viejo',
    type: 'event.created',
    title: 'Beto S. creó Gira Sinfónica',
    body: null,
    linkUrl: '/events/evt-e2e-1',
    readAt: minutesAgo(60 * 24 * 3),
    createdAt: minutesAgo(60 * 24 * 4),
    entity: 'ARTA',
  },
];

const EVENT_ROUTES = {
  '/events/evt-e2e-1': {
    id: 'evt-e2e-1',
    name: 'Noche de Boleros',
    venue: 'Auditorio Arema',
    city: 'Puebla',
    status: 'ACTIVE',
    entity: 'ARTA',
    startsAt: '2026-12-20T02:00:00.000Z',
    checklists: [],
    purchaseOrders: [],
    financeRuns: [],
    campaign: null,
    ticketingSetups: [],
    files: [],
    tasks: [],
    sponsors: [],
  },
  '/documents/event/evt-e2e-1': [],
  '/vendor/event/evt-e2e-1': [],
};

test.describe('Campana', () => {
  test('agrupa por día, separa lo que espera tu decisión y lleva a donde toca', async ({ page, baseURL }) => {
    const read: string[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      ...EVENT_ROUTES,
      '/notifications': NOTICES,
      '/notifications/unread-count': { count: 2 },
      '/notifications/n-oc/read': (route: Route) => {
        read.push('n-oc');
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      },
    });
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Avisos (2 sin leer)' }).click();
    const panel = page.getByRole('dialog', { name: 'Avisos' });
    await expect(panel.getByRole('heading', { name: 'Hoy' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Antes' })).toBeVisible();
    await expect(panel.getByText('Aprobaciones · hace 5 min')).toBeVisible();

    // «Por atender» es lo sin leer que espera algo de ti; el archivo subido no.
    await panel.getByRole('tab', { name: /Por atender/ }).click();
    await expect(panel.getByText('Mateo R. pide autorizar la OC 4F2A9C')).toBeVisible();
    await expect(panel.getByText('Ana R. subió 3 archivos')).toHaveCount(0);

    await panel.getByText('Mateo R. pide autorizar la OC 4F2A9C').click();
    await expect(page).toHaveURL(/\/events\/evt-e2e-1\?tab=ocs/);
    await expect.poll(() => read).toEqual(['n-oc']);
  });

  test('marcar uno leído no te saca de la lista', async ({ page, baseURL }) => {
    const read: string[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications': NOTICES,
      '/notifications/unread-count': { count: 2 },
      '/notifications/n-doc/read': (route: Route) => {
        read.push('n-doc');
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      },
    });
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Avisos (2 sin leer)' }).click();
    await page.getByRole('button', { name: 'Marcar como leído: Ana R. subió 3 archivos' }).click();

    await expect.poll(() => read).toEqual(['n-doc']);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('button', { name: 'Avisos (1 sin leer)' })).toBeVisible();
  });

  test('sin avisos lo dice con calma', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {});
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Avisos', exact: true }).click();
    await expect(page.getByText('Sin avisos por ahora')).toBeVisible();
  });

  test('llegar tocando un aviso del sistema lo deja leído y limpia la dirección', async ({ page, baseURL }) => {
    const read: string[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      ...EVENT_ROUTES,
      '/notifications/n-oc/read': (route: Route) => {
        read.push('n-oc');
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      },
    });
    await page.goto('/events/evt-e2e-1?tab=ocs&notif=n-oc');

    await expect.poll(() => read).toEqual(['n-oc']);
    await expect(page).toHaveURL(/\?tab=ocs$/);
  });
});

/**
 * Un Socket.IO mínimo por long-polling: saluda, conecta y entrega `events`, cada uno
 * en su propia respuesta, para probar lo que pasa cuando el aviso llega en vivo.
 */
async function fakeSocket(page: import('@playwright/test').Page, events: Array<[string, unknown]>) {
  const queue = [
    `0${JSON.stringify({ sid: 'e2e', upgrades: [], pingInterval: 25000, pingTimeout: 60000, maxPayload: 1000000 })}`,
    `40${JSON.stringify({ sid: 'e2e-ns' })}`,
    ...events.map((event) => `42${JSON.stringify(event)}`),
  ];
  await page.route('**/api/socket.io/**', async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
    }
    const next = queue.shift();
    if (next) return route.fulfill({ status: 200, contentType: 'text/plain; charset=UTF-8', body: next });
    // Sin nada que entregar, el sondeo se queda colgado como en un servidor real.
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '6' }).catch(() => undefined);
  });
}

test.describe('Aviso en vivo', () => {
  test('sale como tarjeta, la campana suma, y tocarla lleva al aviso y lo marca leído', async ({ page, baseURL }) => {
    const read: string[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      ...EVENT_ROUTES,
      '/notifications': [],
      '/notifications/n-oc/read': (route: Route) => {
        read.push('n-oc');
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      },
    });
    await fakeSocket(page, [['notification:new', { notification: NOTICES[0], unread: 1 }]]);
    await page.goto('/dashboard');

    const toast = page.locator('.ltoast', { hasText: 'Mateo R. pide autorizar la OC 4F2A9C' });
    await expect(toast).toBeVisible();
    await toast.locator('.ltoast__open').click();

    await expect(page).toHaveURL(/\/events\/evt-e2e-1\?tab=ocs/);
    await expect.poll(() => read).toEqual(['n-oc']);
    await expect(toast).toHaveCount(0);
  });

  test('se puede cerrar sin abrirla, y dentro del chat no estorba con mensajes', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {});
    await fakeSocket(page, [
      [
        'chat:channel-activity',
        { channelId: 'c1', messageId: 'm1', preview: '¿Ya salió el camión?', senderName: 'Beto S.', notify: true },
      ],
    ]);
    await page.goto('/dashboard');

    const toast = page.locator('.ltoast', { hasText: 'Beto S.' });
    await expect(toast).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar aviso' }).click();
    await expect(toast).toHaveCount(0);
  });
});

test.describe('Pantalla de avisos', () => {
  test('filtra por categoría y trae los anteriores al pedirlos', async ({ page, baseURL }) => {
    const before: string[] = [];
    const firstPage = Array.from({ length: 50 }, (_, i) => ({
      ...NOTICES[1],
      id: `n-${i}`,
      title: `Aviso ${i}`,
      createdAt: minutesAgo(i + 1),
    }));
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications': (route: Route) => {
        const url = new URL(route.request().url());
        const cursor = url.searchParams.get('before');
        if (cursor) before.push(cursor);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(cursor ? [NOTICES[0]] : firstPage),
        });
      },
    });
    await page.goto('/notifications');

    await expect(page.getByRole('heading', { name: 'Avisos', level: 2 })).toBeVisible();
    await expect(page.getByText('Aviso 0', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Ver avisos anteriores' }).click();
    await expect(page.getByText('Mateo R. pide autorizar la OC 4F2A9C')).toBeVisible();
    expect(before).toEqual([firstPage[49].createdAt]);
    // Página incompleta: ya no hay más.
    await expect(page.getByRole('button', { name: 'Ver avisos anteriores' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Aprobaciones' }).click();
    await expect(page.getByText('Aviso 0', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Mateo R. pide autorizar la OC 4F2A9C')).toBeVisible();
  });
});

test.describe('Qué llega al teléfono', () => {
  test('apagar una categoría y poner horario silencioso se guarda', async ({ page, baseURL }) => {
    const saved: Array<Record<string, unknown>> = [];
    let current: Record<string, unknown> = {
      muted: [],
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
    };
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications/preferences': (route: Route) => {
        if (route.request().method() === 'PATCH') {
          current = JSON.parse(route.request().postData() || '{}');
          saved.push(current);
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) });
      },
    });
    await page.goto('/settings#avisos');

    const documentos = page.getByRole('switch', { name: 'Avisos de Documentos' });
    await expect(documentos).toHaveAttribute('aria-checked', 'true');
    await documentos.click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0].muted).toEqual(['documents']);
    await expect(documentos).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('switch', { name: 'Horario silencioso' }).click();
    await expect.poll(() => saved.length).toBe(2);
    expect((saved[1].quietHours as { enabled: boolean }).enabled).toBe(true);
    await expect(page.getByLabel('De', { exact: true })).toHaveValue('22:00');
  });
});

test.describe('Preguntas del panel', () => {
  test('cancelar el motivo de un reemplazo cancela de verdad', async ({ page, baseURL }) => {
    const replaced: string[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      ...EVENT_ROUTES,
      '/slots/event/evt-e2e-1/replace': (route: Route) => {
        replaced.push('x');
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      },
    });
    await page.goto('/events/evt-e2e-1?tab=finance');

    await page.locator('label', { hasText: 'Reemplazar por externo' }).locator('input[type=file]').setInputFiles({
      name: 'externo.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK'),
    });
    const dialog = page.getByRole('alertdialog', { name: 'Reemplazar por documento externo' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await expect(dialog).toHaveCount(0);
    expect(replaced).toEqual([]);
  });

  test('borrar un evento pregunta en un diálogo del panel y Esc lo cierra sin borrar', async ({ page, baseURL }) => {
    const deleted: string[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/documents/event/evt-e2e-1': [],
      '/vendor/event/evt-e2e-1': [],
      '/events/evt-e2e-1': (route: Route) => {
        if (route.request().method() === 'DELETE') deleted.push('x');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EVENT_ROUTES['/events/evt-e2e-1']),
        });
      },
    });
    await page.goto('/events/evt-e2e-1');

    await page.locator('.ev-more > summary').click();
    await page.getByRole('menuitem', { name: /Eliminar/ }).click();
    const dialog = page.getByRole('alertdialog', { name: '¿Eliminar el evento?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Eliminar evento' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(deleted).toEqual([]);
  });
});
