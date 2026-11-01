import { expect, test, type Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession, TEST_USER } from './support/mock-api';

/**
 * Chat con referencias: arrobar una tarea, ver su tarjeta en vivo, actuar desde
 * ahí, `/tarea` y «Crear tarea» (docs/CHAT-V2-CONTRATO.md § 9). También lo que
 * se cuelga de las tareas: la liga de los avisos y los comentarios.
 */

const CHANNEL = 'ch-refs';
const ME = TEST_USER.id;

const taskCard = (over: Record<string, unknown> = {}) => ({
  kind: 'task',
  id: 't-luces',
  label: 'Cotizar luces',
  title: 'Cotizar luces',
  resolved: true,
  canOpen: true,
  missing: false,
  href: '/tasks?task=t-luces',
  status: 'OPEN',
  statusLabel: 'Pendiente',
  tone: 'action',
  subtitle: 'vence mañana · Noche de Boleros',
  dueAt: null,
  progress: null,
  people: [{ id: 'u-beto', fullName: 'Beto Soto' }],
  amount: null,
  actions: ['deliver'],
  ...over,
});

const eventCard = {
  kind: 'event',
  id: 'e-boleros',
  label: 'Noche de Boleros',
  title: 'Noche de Boleros',
  resolved: true,
  canOpen: true,
  missing: false,
  href: '/events/e-boleros',
  status: 'ACTIVE',
  statusLabel: 'Activo',
  tone: 'info',
  subtitle: 'sáb 7 nov · Foro Sol',
  dueAt: null,
  progress: 64,
  people: [],
  amount: null,
  actions: [],
};

const message = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  channelId: CHANNEL,
  parentId: null,
  kind: 'TEXT',
  body: 'hola equipo',
  attachment: null,
  pinnedAt: null,
  editedAt: null,
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  author: { id: 'u-beto', fullName: 'Beto Soto', title: 'Producción' },
  replyCount: 0,
  reactions: [],
  replyTo: null,
  deleted: false,
  saved: false,
  refs: [],
  ...over,
});

const summary = {
  id: CHANNEL,
  kind: 'PUBLIC',
  slug: 'general',
  name: 'general',
  topic: null,
  description: null,
  eventId: null,
  peer: null,
  isMember: true,
  memberCount: 2,
  postingRestricted: false,
  canPost: true,
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: 'hola',
  unreadCount: 0,
  muted: false,
  mutedUntil: null,
  isGroupDm: false,
  entity: 'ARTA',
};

const detail = {
  ...summary,
  canManage: false,
  lastReadAt: null,
  members: [
    { id: ME, fullName: TEST_USER.fullName, title: null, role: 'member' },
    { id: 'u-beto', fullName: 'Beto Soto', title: 'Producción', role: 'member' },
  ],
};

const fulfill = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function openChat(
  page: import('@playwright/test').Page,
  baseURL: string | undefined,
  opts: { messages?: unknown[]; extra?: Record<string, unknown> } = {},
) {
  const posted: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];
  await seedSession(page, baseURL!);
  await mockAuthenticatedApi(page, {
    '/chat/channels': [summary],
    [`/chat/channels/${CHANNEL}`]: detail,
    [`/chat/channels/${CHANNEL}/read`]: { ok: true },
    '/chat/unread': { total: 0 },
    '/chat/presence': { online: [] },
    '/chat/prefs': { dndUntil: null },
    [`/chat/channels/${CHANNEL}/pins`]: [],
    [`/chat/channels/${CHANNEL}/messages`]: (route: Route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        posted.push(body);
        return fulfill(
          route,
          message({
            id: `m-new-${posted.length}`,
            body: body.body,
            clientId: body.clientId,
            author: { id: ME, fullName: TEST_USER.fullName },
            createdAt: new Date().toISOString(),
            refs: (body.refs ?? []).map((r: { kind: string; id: string }) => (r.kind === 'event' ? eventCard : taskCard())),
          }),
        );
      }
      return fulfill(route, { messages: opts.messages ?? [message()], hasMore: false, hasNewer: false });
    },
    '/chat/refs/search': { results: [taskCard(), eventCard] },
    '/chat/refs/cards': (route: Route) =>
      fulfill(route, {
        refs: route.request().postDataJSON().refs.map((r: { kind: string; id: string }) => taskCard({ id: r.id })),
      }),
    '/tasks': (route: Route) => {
      created.push(route.request().postDataJSON());
      return fulfill(route, { id: 't-nueva' });
    },
    '/users/directory': [{ id: 'u-beto', fullName: 'Beto Soto', title: 'Producción' }],
    ...opts.extra,
  });
  await page.goto(`/chat?channel=${CHANNEL}`);
  await expect(page.getByRole('textbox', { name: 'Mensaje' })).toBeVisible();
  return { posted, created };
}

test.describe('Chat · referencias', () => {
  test('la @ encuentra personas y cosas, agrupadas; lo elegido viaja como referencia', async ({ page, baseURL }) => {
    const { posted } = await openChat(page, baseURL);
    const box = page.getByRole('textbox', { name: 'Mensaje' });

    await box.fill('revisa @');
    await box.press('End');
    const list = page.getByRole('listbox', { name: 'Mencionar o ligar' });
    await expect(list.getByText('Personas')).toBeVisible();
    await expect(list.getByText('Tareas')).toBeVisible();
    await expect(list.getByText('Eventos')).toBeVisible();

    await list.getByRole('option', { name: /Cotizar luces/ }).click();
    await expect(box).toHaveValue('revisa @Cotizar luces ');
    await box.press('Enter');

    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].body).toBe('revisa @Cotizar luces');
    expect(posted[0].refs).toEqual([{ kind: 'task', id: 't-luces' }]);
    // En el mensaje: el chip liga a la tarea y debajo va la tarjeta con su estado.
    await expect(page.locator('.chat-msg__body .chat-ref', { hasText: 'Cotizar luces' })).toHaveAttribute('href', '/tasks?task=t-luces');
    await expect(page.locator('.ref-card').getByText('Pendiente')).toBeVisible();
  });

  test('si se borra lo arrobado antes de enviar, no se liga', async ({ page, baseURL }) => {
    const { posted } = await openChat(page, baseURL);
    const box = page.getByRole('textbox', { name: 'Mensaje' });
    await box.fill('@');
    await box.press('End');
    await page.getByRole('option', { name: /Cotizar luces/ }).click();
    await box.fill('mejor otra cosa');
    await box.press('Enter');
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].body).toBe('mejor otra cosa');
    expect(posted[0].refs).toEqual([]);
  });

  test('sin acceso: la etiqueta se ve pero sin liga, monto ni tarjeta', async ({ page, baseURL }) => {
    await openChat(page, baseURL, {
      messages: [
        message({
          body: 'revisen @OC 4F2A9C',
          refs: [
            {
              ...taskCard({ kind: 'po', id: 'p1', label: 'OC 4F2A9C', title: 'OC 4F2A9C' }),
              canOpen: false,
              href: null,
              statusLabel: null,
              amount: null,
              actions: [],
            },
          ],
        }),
      ],
    });
    const chip = page.locator('.chat-ref.is-locked', { hasText: 'OC 4F2A9C' });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveJSProperty('tagName', 'SPAN');
    await expect(page.locator('.ref-card')).toHaveCount(0);
  });

  test('lo que llega sin resolver pide su tarjeta con los permisos de quien lee', async ({ page, baseURL }) => {
    const cards: unknown[] = [];
    await openChat(page, baseURL, {
      messages: [
        message({
          body: 'mira @Cotizar luces',
          refs: [{ kind: 'task', id: 't-luces', label: 'Cotizar luces', title: 'Cotizar luces', resolved: false, canOpen: false }],
        }),
      ],
      extra: {
        '/chat/refs/cards': (route: Route) => {
          cards.push(route.request().postDataJSON());
          return fulfill(route, { refs: [taskCard()] });
        },
      },
    });
    await expect(page.locator('.ref-card').getByText('Pendiente')).toBeVisible();
    expect(cards[0]).toEqual({ refs: [{ kind: 'task', id: 't-luces' }] });
  });

  test('«Aprobar» y «Marcar hecha» actúan desde la tarjeta', async ({ page, baseURL }) => {
    const hits: string[] = [];
    await openChat(page, baseURL, {
      messages: [
        message({ id: 'a', body: '@Revisar', refs: [taskCard({ id: 't-a', label: 'Revisar', actions: ['approve'] })] }),
        message({ id: 'b', body: '@Mia', refs: [taskCard({ id: 't-b', label: 'Mia', actions: ['complete'] })] }),
      ],
      extra: {
        '/tasks/t-a/approve': (route: Route) => {
          hits.push(`${route.request().method()} approve`);
          return fulfill(route, {});
        },
        '/tasks/t-b': (route: Route) => {
          hits.push(`${route.request().method()} ${route.request().postData()}`);
          return fulfill(route, {});
        },
      },
    });
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await page.getByRole('button', { name: 'Marcar hecha' }).click();
    await expect.poll(() => hits).toEqual(['POST approve', 'PATCH {"status":"DONE"}']);
  });

  test('«Entregar» abre la entrega con nota', async ({ page, baseURL }) => {
    const submitted: unknown[] = [];
    await openChat(page, baseURL, {
      messages: [message({ body: '@Cotizar luces', refs: [taskCard()] })],
      extra: {
        '/tasks/t-luces': { id: 't-luces', title: 'Cotizar luces', status: 'OPEN', evidences: [] },
        '/tasks/t-luces/submit': (route: Route) => {
          submitted.push(route.request().postDataJSON());
          return fulfill(route, { id: 't-luces', title: 'Cotizar luces', status: 'PENDING_APPROVAL' });
        },
      },
    });
    await page.locator('.ref-card').getByRole('button', { name: 'Entregar' }).click();
    const dialog = page.locator('.modal');
    await dialog.locator('textarea').fill('Ya está cotizado');
    await dialog.getByRole('button', { name: 'Enviar entrega' }).click();
    await expect.poll(() => submitted).toEqual([{ completionNote: 'Ya está cotizado' }]);
  });

  test('/tarea crea la tarea y la deja dicha en la conversación', async ({ page, baseURL }) => {
    const { posted, created } = await openChat(page, baseURL);
    const box = page.getByRole('textbox', { name: 'Mensaje' });

    await box.fill('/');
    await expect(page.getByRole('option', { name: /\/tarea/ })).toBeVisible();
    await page.getByRole('option', { name: /\/tarea/ }).click();
    await expect(box).toHaveValue('/tarea ');

    await box.pressSequentially('Cotizar luces @Beto Soto mañana');
    await expect(page.getByRole('status').filter({ hasText: 'Se crea la tarea' })).toContainText('Cotizar luces');
    await expect(page.getByRole('status').filter({ hasText: 'Se crea la tarea' })).toContainText('Beto Soto');
    await box.press('Escape');
    await box.press('Enter');

    await expect.poll(() => created.length).toBe(1);
    expect(created[0]).toMatchObject({ title: 'Cotizar luces', assigneeIds: ['u-beto'] });
    expect(String(created[0].dueAt)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].body).toBe('Nueva tarea: @Cotizar luces');
    expect(posted[0].refs).toEqual([{ kind: 'task', id: 't-nueva' }]);
    await expect(box).toHaveValue('');
  });

  test('«Crear tarea» desde un mensaje trae su texto y responde en su hilo', async ({ page, baseURL }) => {
    const { posted, created } = await openChat(page, baseURL, {
      messages: [message({ id: 'm-origen', body: 'Hay que pedir el rider de audio' })],
    });
    await page.locator('#m-m-origen').hover();
    await page.locator('#m-m-origen').getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Crear tarea' }).click();
    const dialog = page.getByRole('dialog', { name: 'Crear tarea' });
    await expect(dialog.getByLabel('Qué hay que hacer')).toHaveValue('Hay que pedir el rider de audio');
    await dialog.getByRole('button', { name: 'Crear tarea' }).click();
    await expect.poll(() => created.length).toBe(1);
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].parentId).toBe('m-origen');
  });

  test('el panel «Ligados» junta lo arrobado y lleva al mensaje', async ({ page, baseURL }) => {
    await openChat(page, baseURL, {
      messages: [message({ id: 'm-liga', body: 'hola' })],
      extra: {
        [`/chat/channels/${CHANNEL}/refs`]: {
          refs: [{ ...taskCard(), messageId: 'm-liga', at: new Date().toISOString(), count: 2 }, { ...eventCard, messageId: 'm-liga', at: new Date().toISOString(), count: 1 }],
        },
      },
    });
    await page.getByRole('button', { name: /ligados a esta conversación/ }).click();
    const panel = page.getByRole('complementary', { name: 'Ligados' });
    await expect(panel.getByText('Tareas')).toBeVisible();
    await expect(panel.getByText('Eventos')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Ir al mensaje (2)' })).toBeVisible();
  });

  test('sin el puesto en el encabezado de cada mensaje', async ({ page, baseURL }) => {
    await openChat(page, baseURL);
    await expect(page.locator('.chat-msg__author').first()).toHaveText('Beto Soto');
    await expect(page.locator('.chat-msg__role')).toHaveCount(0);
  });
});

test.describe('Tareas · liga y comentarios', () => {
  const task = (over: Record<string, unknown> = {}) => ({
    id: 't-liga',
    title: 'Montar escenario',
    status: 'OPEN',
    assigneeId: ME,
    assigneeIds: [ME],
    assignees: [{ id: ME, fullName: TEST_USER.fullName }],
    createdById: 'u-beto',
    createdBy: { id: 'u-beto', fullName: 'Beto Soto' },
    evidences: [],
    activities: [
      { id: 'a1', action: 'created', detail: 'Montar escenario', createdAt: new Date().toISOString(), actor: { id: 'u-beto', fullName: 'Beto Soto' } },
    ],
    ...over,
  });

  test('una liga de aviso lleva a esa tarea aunque la lista no la traiga, y se puede comentar', async ({ page, baseURL }) => {
    const comments: unknown[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/tasks/mine': [],
      '/tasks/t-liga': task(),
      '/tasks/t-liga/comments': (route: Route) => {
        comments.push(route.request().postDataJSON());
        return fulfill(
          route,
          task({
            activities: [
              ...task().activities,
              { id: 'a2', action: 'comment', detail: 'mira [@Beto Soto](user:u-beto)', createdAt: new Date().toISOString(), actor: { id: ME, fullName: TEST_USER.fullName } },
            ],
          }),
        );
      },
      '/chat/refs/backlinks': {
        links: [
          {
            messageId: 'm1',
            channelId: 'c1',
            channelName: '#general',
            author: { id: 'u-beto', fullName: 'Beto Soto' },
            excerpt: 'hay que @Montar escenario',
            at: new Date().toISOString(),
            href: '/chat?channel=c1&msg=m1',
          },
        ],
      },
    });
    await page.goto('/tasks?task=t-liga');
    const focus = page.getByRole('region', { name: 'Tarea Montar escenario' });
    await expect(focus.getByRole('heading', { name: 'Montar escenario' })).toBeVisible();
    await expect(focus.getByRole('button', { name: 'Entregar' })).toBeVisible();
    await expect(focus.getByRole('link', { name: /#general/ })).toHaveAttribute('href', '/chat?channel=c1&msg=m1');

    await focus.getByLabel('Comentario').fill('quedó listo');
    await focus.getByRole('button', { name: 'Comentar' }).click();
    await expect.poll(() => comments).toEqual([{ body: 'quedó listo' }]);
    // El token de mención se lee como nombre, nunca como código.
    await expect(focus.locator('.is-comment .task-timeline__detail')).toHaveText('mira @Beto Soto');
    await expect(focus.getByLabel('Comentario')).toHaveValue('');
  });

  test('«Entregar» del aviso abre la entrega al llegar', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, { '/tasks/mine': [], '/tasks/t-liga': task() });
    await page.goto('/tasks?task=t-liga&do=deliver');
    await expect(page.locator('.modal').locator('textarea')).toBeVisible();
  });

  test('una liga vieja no truena: dice que ya no está', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/tasks/mine': [],
      '/tasks/ya-no': (route: Route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"No encontrado"}' }),
    });
    await page.goto('/tasks?task=ya-no');
    await expect(page.getByText('Esa tarea ya no existe o no tienes acceso')).toBeVisible();
  });
});
