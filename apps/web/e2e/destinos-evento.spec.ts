import { expect, test, type Page, type Route } from '@playwright/test';

import { mockApi, seedSession, TEST_USER } from './support/mock-api';

/**
 * Adam, 07-11-2026: cada clic cae en lo exacto. El mosaico y el aviso de formatos abren su grupo
 * (`?ver=revision` → «Por autorizar»), el menú del evento lleva a su canal del chat y dirección
 * atiende los reportes del chat desde `?reportes=1`.
 */

const DIRECCION = { ...TEST_USER, id: 'usr-dir', fullName: 'José Luis Arista', roleKey: 'dir_general', entities: ['ARTA', 'EXPLANADA'], permissions: [] };

function checklist(id: string, title: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title,
    status: 'DRAFT',
    progressPct: 40,
    template: { id: `tpl-${id}`, key: 'EVENTO_GENERAL' },
    dataJson: { sections: [] },
    versions: [],
    signatures: [],
    ...over,
  };
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
  checklists: [
    checklist('cl-1', 'Checklist Evento General'),
    // Entregado y sin autorizar: es lo que cuenta como «Por autorizar».
    checklist('cl-2', 'Transportación', { progressPct: 100, deliveredAt: '2026-11-01T18:00:00.000Z' }),
    checklist('cl-3', 'Catering', { status: 'APPROVED', progressPct: 100 }),
  ],
  purchaseOrders: [],
  financeRuns: [],
  campaign: null,
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

const EVENT_CHANNEL = {
  id: 'ch-evt-1',
  kind: 'PUBLIC',
  slug: 'evento-noche-de-bandas',
  name: 'Noche de Bandas',
  topic: 'Producción del evento',
  description: null,
  eventId: 'evt-1',
  peer: null,
  isMember: true,
  memberCount: 3,
  postingRestricted: false,
  canPost: true,
  canManage: false,
  lastReadAt: null,
  lastMessageAt: null,
  lastMessagePreview: null,
  unreadCount: 0,
  muted: false,
  mutedUntil: null,
  isGroupDm: false,
  entity: 'ARTA',
  members: [{ id: 'usr-dir', fullName: 'José Luis Arista', title: null, role: 'owner' }],
};

const REPORT = {
  id: 'rep-1',
  reason: 'SPAM',
  details: 'Manda la misma liga tres veces.',
  status: 'OPEN',
  createdAt: '2026-11-07T15:00:00.000Z',
  reporter: { id: 'usr-beto', name: 'Beto Sandoval' },
  reportedUser: { id: 'usr-luis', name: 'Luis Pérez' },
  message: { id: 'm-spam', body: 'Compra aquí https://ejemplo.test/oferta', channelId: 'ch-general', channelName: 'general', channelKind: 'PUBLIC' },
};

const fulfill = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function openEvent(page: Page, baseURL: string, query: string, extra: Record<string, unknown> = {}) {
  await seedSession(page, baseURL);
  await mockApi(page, {
    '/auth/me': { user: DIRECCION },
    '/events/evt-1': EVENT,
    '/documents/event/evt-1': [],
    '/vendor/event/evt-1': [],
    '/testigos/event/evt-1': [],
    ...extra,
  } as never);
  await page.goto(`/events/evt-1${query}`);
  await expect(page.getByRole('heading', { name: 'Noche de Bandas' }).first()).toBeVisible();
}

test.describe('Destinos exactos del evento', () => {
  test('`?ver=revision` abre los formatos por autorizar', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, '?tab=checklists&ver=revision');
    await expect(page.getByRole('tab', { name: /Por autorizar/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /Todos/ })).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByText('Transportación')).toBeVisible();
    await expect(page.getByText('Checklist Evento General')).toHaveCount(0);
  });

  test('el menú del evento lleva a su canal del chat', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, '', {
      '/chat/channels': [EVENT_CHANNEL],
      '/chat/event/evt-1': EVENT_CHANNEL,
      '/chat/channels/ch-evt-1': EVENT_CHANNEL,
      '/chat/channels/ch-evt-1/messages': { messages: [], hasMore: false, hasNewer: false },
      '/chat/channels/ch-evt-1/read': { ok: true },
      '/chat/unread': { total: 0 },
      '/chat/presence': { online: [] },
      '/chat/prefs': { dndUntil: null },
      '/chat/blocks': [],
    });
    await page.locator('.ev-more > summary').first().click();
    const item = page.getByRole('menuitem', { name: 'Chat del evento' });
    await expect(item).toBeVisible();
    await item.click();
    // `/chat?event=evt-1` abre (o crea) el canal del evento y se queda en él.
    await expect(page).toHaveURL(/\/chat\?(event=evt-1|channel=ch-evt-1)/);
    await expect(page.locator('.chat-head__title')).toContainText('Noche de Bandas');
  });
});

test.describe('Reportes del chat', () => {
  test('dirección abre la cola desde `?reportes=1` y cierra un reporte', async ({ page, baseURL }) => {
    const patches: unknown[] = [];
    await seedSession(page, baseURL!);
    await mockApi(page, {
      '/auth/me': { user: DIRECCION },
      '/chat/channels': [],
      '/chat/unread': { total: 0 },
      '/chat/presence': { online: [] },
      '/chat/prefs': { dndUntil: null },
      '/chat/blocks': [],
      '/chat/reports': [REPORT],
      '/chat/reports/rep-1': async (route: Route) => {
        patches.push(route.request().postDataJSON());
        await fulfill(route, { ok: true });
      },
    } as never);
    await page.goto('/chat?reportes=1');

    const panel = page.locator('.chat-panel');
    await expect(panel.locator('.chat-panel__title')).toHaveText('Reportes');
    await expect(panel.getByText('Spam')).toBeVisible();
    await expect(panel.getByText('Beto Sandoval')).toBeVisible();
    await expect(panel.getByText('Luis Pérez')).toBeVisible();
    await expect(panel.getByText('Manda la misma liga tres veces.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Ver mensaje' })).toBeVisible();
    // La barra lateral cuenta los abiertos.
    await expect(page.locator('.chat-nav__item', { hasText: 'Reportes' }).locator('.chat-nav__badge')).toHaveText('1');

    await panel.getByRole('button', { name: 'Marcar resuelto' }).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ status: 'RESOLVED' });
    await expect(panel.getByText('Sin reportes abiertos')).toBeVisible();
  });
});
