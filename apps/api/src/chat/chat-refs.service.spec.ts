import { cleanRefInput, matchesQuery, MAX_REFS_PER_MESSAGE, refsStillInBody } from './chat-refs';
import { ChatRefsService, type RefViewer } from './chat-refs.service';

const ORG = 'org_arta_internal';
const event = { id: 'e1', name: 'Noche de Boleros', entity: 'ARTA', organizationId: ORG, status: 'ACTIVE' };

const production: RefViewer = { id: 'u1', roleKey: 'produccion', organizationId: ORG, entities: ['ARTA'], fullName: 'Ana Ruiz' };
const auditorio: RefViewer = { id: 'u9', roleKey: 'produccion', organizationId: ORG, entities: ['EXPLANADA'], fullName: 'Rita Paz' };
/**
 * Las OC ya no las ve producción (01-11-2026). Las pruebas de OC van con compras en los dos negocios:
 * así lo que detiene a `buyerAuditorio` es la entidad, no que su rol no vea OC en ningún lado.
 */
const buyer: RefViewer = { id: 'u1', roleKey: 'compras', organizationId: ORG, entities: ['ARTA'], fullName: 'Ana Ruiz' };
const buyerAuditorio: RefViewer = { id: 'u9', roleKey: 'compras', organizationId: ORG, entities: ['EXPLANADA'], fullName: 'Rita Paz' };

function taskRow(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    title: 'Cotizar luces',
    status: 'OPEN',
    dueAt: null,
    eventId: 'e1',
    entity: 'ARTA',
    organizationId: ORG,
    assigneeId: 'u1',
    createdById: 'u2',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    assignee: { id: 'u1', fullName: 'Ana Ruiz' },
    coAssignees: [],
    event,
    ...over,
  };
}

function poRow(over: Record<string, unknown> = {}) {
  return {
    id: 'cmpo00abc123',
    rubro: 'Audio',
    vendorName: 'Sonido Quetzal',
    description: null,
    amount: 37700,
    currency: 'MXN',
    status: 'PENDING_AUTH',
    createdById: 'u3',
    eventId: 'e1',
    event,
    ...over,
  };
}

function setup(rows: Record<string, unknown[]> = {}) {
  const many = (key: string) => jest.fn().mockResolvedValue(rows[key] ?? []);
  const prisma = {
    taskAssignment: { findMany: many('tasks'), groupBy: jest.fn().mockResolvedValue(rows.progress ?? []) },
    event: { findMany: many('events') },
    purchaseOrder: { findMany: many('pos') },
    checklistInstance: { findMany: many('formats') },
    eventDocument: { findMany: many('docs') },
    paymentProof: { findMany: many('advances') },
    chatChannel: { findFirst: jest.fn().mockResolvedValue(rows.channel?.[0] ?? null) },
    chatMessageRef: { findMany: many('refs') },
    user: { findMany: many('users') },
  };
  const notifications = { notifyMany: jest.fn().mockResolvedValue([]) };
  const realtime = { emitToChannel: jest.fn() };
  const service = new ChatRefsService(prisma as never, notifications as never, realtime as never);
  return { service, prisma, notifications, realtime };
}

describe('chat-refs: entrada del cliente', () => {
  it('ignora tipos raros y repetidos, y respeta el tope', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: 'task', id: `t${i}` }));
    expect(cleanRefInput(many)).toHaveLength(MAX_REFS_PER_MESSAGE);
    expect(
      cleanRefInput([{ kind: 'task', id: 'a' }, { kind: 'task', id: 'a' }, { kind: 'user', id: 'b' }, { kind: 'po' }, null]),
    ).toEqual([{ kind: 'task', id: 'a' }]);
    expect(cleanRefInput('nada')).toEqual([]);
  });

  it('busca sin acentos ni mayúsculas, con todas las palabras', () => {
    expect(matchesQuery('produccion luz', 'Producción de LUZ')).toBe(true);
    expect(matchesQuery('audio luz', 'Producción de luz')).toBe(false);
    expect(matchesQuery('', 'lo que sea')).toBe(true);
  });

  it('al editar sin refs se queda lo que sigue escrito', () => {
    const refs = [{ label: 'Cotizar luces' }, { label: 'OC ABC123' }];
    expect(refsStillInBody('ya quedó @OC ABC123', refs)).toEqual([{ label: 'OC ABC123' }]);
  });
});

describe('ChatRefsService.cards: lo que cada quien puede ver', () => {
  it('quien opera el evento y ve OC ve estado, monto y liga de la OC', async () => {
    const { service } = setup({ pos: [poRow()] });
    const c = (await service.cards(buyer, [{ kind: 'po', id: 'cmpo00abc123' }])).get('po:cmpo00abc123')!;
    expect(c).toMatchObject({
      canOpen: true,
      label: 'OC ABC123',
      statusLabel: 'Por autorizar',
      amount: '$37,700',
      href: '/purchase-orders?po=cmpo00abc123',
    });
  });

  it('quien opera el evento pero no ve OC (Williams) solo ve la etiqueta', async () => {
    const { service } = setup({ pos: [poRow()] });
    const c = (await service.cards(production, [{ kind: 'po', id: 'cmpo00abc123' }])).get('po:cmpo00abc123')!;
    expect(c).toMatchObject({ canOpen: false, resolved: true, amount: null, statusLabel: null, href: null });
  });

  it('el otro negocio no ve ni monto ni estado: solo la etiqueta', async () => {
    const { service } = setup({ pos: [poRow()] });
    const c = (await service.cards(buyerAuditorio, [{ kind: 'po', id: 'cmpo00abc123' }])).get('po:cmpo00abc123')!;
    expect(c).toMatchObject({ canOpen: false, resolved: true, amount: null, statusLabel: null, href: null });
  });

  it('un formato solo lo abre quien lo ve: Iliana, catering sí y Evento General no', async () => {
    const format = (key: string) => ({
      id: `f-${key}`,
      title: key,
      progressPct: 10,
      status: 'DRAFT',
      eventId: 'e1',
      template: { key },
      event,
    });
    const iliana: RefViewer = { id: 'u7', roleKey: 'catering', organizationId: ORG, entities: ['ARTA', 'EXPLANADA'] };
    const { service } = setup({ formats: [format('CATERING'), format('EVENTO_GENERAL')] });
    const cards = await service.cards(iliana, [
      { kind: 'format', id: 'f-CATERING' },
      { kind: 'format', id: 'f-EVENTO_GENERAL' },
    ]);
    expect(cards.get('format:f-CATERING')).toMatchObject({ canOpen: true, statusLabel: 'Borrador' });
    expect(cards.get('format:f-EVENTO_GENERAL')).toMatchObject({ canOpen: false, statusLabel: null, href: null });
  });

  it('un documento no lo abre Monse: los documentos del evento no le tocan', async () => {
    const doc = { id: 'd1', title: 'Contrato', status: 'DRAFT', version: 2, eventId: 'e1', createdById: 'u3', event };
    const monse: RefViewer = { id: 'u8', roleKey: 'contenido', organizationId: ORG, entities: ['ARTA', 'EXPLANADA'] };
    const locked = await setup({ docs: [doc] }).service.cards(monse, [{ kind: 'doc', id: 'd1' }]);
    expect(locked.get('doc:d1')).toMatchObject({ canOpen: false, statusLabel: null, href: null });
    const open = await setup({ docs: [doc] }).service.cards(buyer, [{ kind: 'doc', id: 'd1' }]);
    expect(open.get('doc:d1')).toMatchObject({ canOpen: true, statusLabel: 'Borrador' });
  });

  it('un anticipo solo lo abre quien lo pidió o quien ve finanzas', async () => {
    const advance = {
      id: 'adv1',
      label: 'Viáticos',
      note: null,
      amount: 5000,
      advanceStatus: 'PENDING',
      entity: 'ARTA',
      eventId: null,
      uploadedById: 'u3',
    };
    const refs = [{ kind: 'advance' as const, id: 'adv1' }];
    const stranger = await setup({ advances: [advance] }).service.cards(production, refs);
    expect(stranger.get('advance:adv1')).toMatchObject({ canOpen: false, amount: null });
    const owner = await setup({ advances: [advance] }).service.cards({ ...production, id: 'u3' }, refs);
    expect(owner.get('advance:adv1')).toMatchObject({ canOpen: true, amount: '$5,000', statusLabel: 'Por aprobar' });
    const finance = await setup({ advances: [advance] }).service.cards(
      { ...production, permissions: ['finance.view'] },
      refs,
    );
    expect(finance.get('advance:adv1')?.canOpen).toBe(true);
  });

  it('la tarea dice qué te toca: entregar si es tuya, revisar si la pediste', async () => {
    const refs = [{ kind: 'task' as const, id: 't1' }];
    const mine = await setup({ tasks: [taskRow()] }).service.cards(production, refs);
    expect(mine.get('task:t1')).toMatchObject({ actions: ['deliver'], tone: 'action', statusLabel: 'Pendiente' });

    const review = await setup({ tasks: [taskRow({ status: 'PENDING_APPROVAL' })] }).service.cards(
      { ...production, id: 'u2' },
      refs,
    );
    expect(review.get('task:t1')).toMatchObject({ actions: ['approve'], statusLabel: 'Por revisar' });

    const other = await setup({ tasks: [taskRow()] }).service.cards({ ...production, id: 'u5' }, refs);
    expect(other.get('task:t1')).toMatchObject({ actions: [], tone: 'info' });
  });

  it('si la pedí yo mismo no hay revisión: basta marcarla hecha', async () => {
    const refs = [{ kind: 'task' as const, id: 't1' }];
    const own = await setup({ tasks: [taskRow({ createdById: 'u1' })] }).service.cards(production, refs);
    expect(own.get('task:t1')?.actions).toEqual(['complete']);
  });

  it('una tarea vencida lo dice y un evento cerrado ya no deja actuar', async () => {
    const refs = [{ kind: 'task' as const, id: 't1' }];
    const late = await setup({ tasks: [taskRow({ dueAt: new Date('2026-10-01T12:00:00Z'), assigneeId: 'u5', assignee: null })] }).service.cards(
      production,
      refs,
      new Date('2026-11-01T12:00:00Z'),
    );
    expect(late.get('task:t1')).toMatchObject({ statusLabel: 'Vencida', tone: 'late' });

    const closed = await setup({ tasks: [taskRow({ event: { ...event, status: 'CLOSED' } })] }).service.cards(production, refs);
    expect(closed.get('task:t1')?.actions).toEqual([]);
  });

  it('el evento trae su avance', async () => {
    const { service } = setup({
      events: [{ ...event, artist: null, startsAt: null, venue: 'Foro Sol', city: null }],
      progress: [
        { eventId: 'e1', status: 'DONE', _count: { _all: 3 } },
        { eventId: 'e1', status: 'OPEN', _count: { _all: 1 } },
      ],
    });
    const c = (await service.cards(production, [{ kind: 'event', id: 'e1' }])).get('event:e1')!;
    expect(c).toMatchObject({ progress: 75, subtitle: 'Foro Sol', href: '/events/e1' });
  });

  it('lo que ya no existe queda marcado', async () => {
    const { service } = setup();
    const c = (await service.cards(production, [{ kind: 'task', id: 'gone' }])).get('task:gone')!;
    expect(c).toMatchObject({ missing: true, canOpen: false });
  });

  it('una sola consulta por tipo, sean cuantas sean las referencias', async () => {
    const { service, prisma } = setup({ tasks: [taskRow(), taskRow({ id: 't2' })] });
    await service.cards(production, [
      { kind: 'task', id: 't1' },
      { kind: 'task', id: 't2' },
    ]);
    expect(prisma.taskAssignment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.purchaseOrder.findMany).not.toHaveBeenCalled();
  });
});

describe('ChatRefsService.hydrate y forPost', () => {
  it('conserva lo escrito en el mensaje aunque la tarea se haya renombrado', async () => {
    const { service } = setup({ tasks: [taskRow({ title: 'Cotizar luces y audio' })] });
    const stub = { kind: 'task', id: 't1', label: 'Cotizar luces', title: 'Cotizar luces', resolved: false } as never;
    const [m] = await service.hydrate(production, [{ refs: [stub] }]);
    expect(m.refs![0]).toMatchObject({ label: 'Cotizar luces', title: 'Cotizar luces y audio', resolved: true });
  });

  it('un mensaje no puede ligar lo que su autor no abre', async () => {
    const { service } = setup({ pos: [poRow()], tasks: [taskRow()] });
    const refs = await service.forPost(buyerAuditorio, [
      { kind: 'po', id: 'cmpo00abc123' },
      { kind: 'task', id: 'no-existe' },
    ]);
    expect(refs).toEqual([]);
    const mine = await setup({ tasks: [taskRow()] }).service.forPost(production, [{ kind: 'task', id: 't1' }]);
    expect(mine).toEqual([{ kind: 'task', targetId: 't1', label: 'Cotizar luces' }]);
    // La misma OC sí la liga quien la ve en su negocio; Williams, no.
    const po = await setup({ pos: [poRow()] }).service.forPost(buyer, [{ kind: 'po', id: 'cmpo00abc123' }]);
    expect(po).toEqual([{ kind: 'po', targetId: 'cmpo00abc123', label: 'OC ABC123' }]);
    expect(await setup({ pos: [poRow()] }).service.forPost(production, [{ kind: 'po', id: 'cmpo00abc123' }])).toEqual([]);
  });
});

describe('ChatRefsService.search', () => {
  const rows = () => ({
    tasks: [
      taskRow({ id: 't2', title: 'Producción de luces', eventId: 'e2', assigneeId: 'u5', assignee: null, createdById: 'u5', event: { name: 'Otro show' } }),
      taskRow({ id: 't1', title: 'Producción de audio', event: { ...event } }),
    ],
    channel: [{ eventId: 'e1' }],
  });

  it('encuentra sin acentos y pone primero lo del evento de la conversación', async () => {
    const { service, prisma } = setup(rows());
    prisma.taskAssignment.findMany
      .mockResolvedValueOnce(rows().tasks)
      .mockResolvedValueOnce(rows().tasks.map((t) => ({ ...t, event })));
    const { results } = await service.search(production, { q: 'produccion', kinds: 'task', channelId: 'c1' });
    expect(results.map((r) => r.id)).toEqual(['t1', 't2']);
  });

  it('sin texto sugiere solo lo que traes a la mano, no todo el catálogo', async () => {
    const { service, prisma } = setup(rows());
    prisma.taskAssignment.findMany
      .mockResolvedValueOnce(rows().tasks)
      .mockResolvedValueOnce([rows().tasks[1]]);
    const { results } = await service.search(production, { kinds: 'task' });
    expect(results.map((r) => r.id)).toEqual(['t1']);
  });

  it('no busca en lo que no opera: otra entidad se queda fuera de la consulta', async () => {
    const { service, prisma } = setup();
    await service.search(auditorio, { q: 'x', kinds: 'po' });
    const where = prisma.purchaseOrder.findMany.mock.calls[0][0].where;
    expect(where.event.entity.in).toEqual(['EXPLANADA']);
    expect(where.event.organizationId).toBe(ORG);
  });
});

describe('ChatRefsService.notifyFor: a quién le importa', () => {
  const channel = {
    id: 'c1',
    organizationId: ORG,
    name: 'general',
    kind: 'PUBLIC' as const,
    isGroupDm: false,
    eventId: null,
    entity: 'ARTA' as const,
  };
  const person = (id: string) => ({ id, roleKey: 'produccion', entities: ['ARTA'] });

  async function notify(
    refs: Array<{ kind: string; targetId: string; label: string }>,
    rows: Record<string, unknown[]>,
    opts: { memberIds?: string[]; skip?: string[]; channel?: Partial<typeof channel> & { kind?: never } } = {},
    ch: Record<string, unknown> = {},
  ) {
    const ctx = setup(rows);
    await ctx.service.notifyFor(
      production,
      { ...channel, ...ch } as never,
      { id: 'm1', body: 'revisa @Cotizar luces', refs },
      { memberIds: new Set(opts.memberIds ?? []), skip: new Set(opts.skip ?? []) },
    );
    return (ctx.notifications.notifyMany.mock.calls[0]?.[0] ?? []) as Array<Record<string, unknown>>;
  }

  const taskRef = { kind: 'task', targetId: 't1', label: 'Cotizar luces' };

  it('la tarea avisa a quien la tiene y a quien la pidió, no a quien escribe', async () => {
    const sent = await notify(
      [taskRef],
      {
        tasks: [taskRow({ assigneeId: 'u5', createdById: 'u2' })],
        users: [person('u5'), person('u2')],
      },
      { memberIds: ['u5', 'u2'] },
    );
    const byUser = new Map(sent.map((n) => [n.userId, n]));
    expect(byUser.get('u5')).toMatchObject({ type: 'chat.ref.task', linkUrl: '/chat?channel=c1&msg=m1' });
    expect(byUser.get('u2')).toMatchObject({ type: 'chat.ref.task_requested' });
    expect(String(byUser.get('u5')!.title)).toContain('mencionó tu tarea en #general');
    expect(byUser.get('u5')!.target).toEqual({ kind: 'task', id: 't1' });
  });

  it('el evento no suena y una tarea terminada tampoco', async () => {
    const sent = await notify(
      [{ kind: 'event', targetId: 'e1', label: 'Noche de Boleros' }, taskRef],
      { tasks: [taskRow({ status: 'DONE', assigneeId: 'u5' })], users: [person('u5')] },
    );
    expect(sent).toEqual([]);
  });

  it('recién creada desde el chat no repite el aviso de «te asignó»', async () => {
    const sent = await notify(
      [taskRef],
      {
        tasks: [taskRow({ assigneeId: 'u5', createdById: 'u1', createdAt: new Date() })],
        users: [person('u5')],
      },
      { memberIds: ['u5'] },
    );
    expect(sent).toEqual([]);
  });

  it('quien ya recibió la mención o bloqueó al autor no recibe otro aviso', async () => {
    const sent = await notify(
      [taskRef],
      { tasks: [taskRow({ assigneeId: 'u5', createdById: 'u5' })], users: [person('u5')] },
      { skip: ['u5'], memberIds: ['u5'] },
    );
    expect(sent).toEqual([]);
  });

  it('en un canal privado, quien no está en él no lee el mensaje: liga a la tarea y sin texto', async () => {
    const [n] = await notify(
      [taskRef],
      { tasks: [taskRow({ assigneeId: 'u5', createdById: 'u1' })], users: [person('u5')] },
      { memberIds: [] },
      { kind: 'PRIVATE' },
    );
    expect(n.linkUrl).toBe('/events/e1?tab=tasks&task=t1');
    expect(String(n.title)).not.toContain('#general');
    expect(String(n.body)).not.toContain('revisa');
    expect(String(n.body)).toContain('Cotizar luces');
  });

  it('en un canal público de su negocio sí lee aunque aún no sea miembro', async () => {
    const [n] = await notify(
      [taskRef],
      { tasks: [taskRow({ assigneeId: 'u5', createdById: 'u1' })], users: [person('u5')] },
      { memberIds: [] },
    );
    expect(n.linkUrl).toBe('/chat?channel=c1&msg=m1');
  });

  it('la OC le avisa a quien la pidió', async () => {
    const [n] = await notify(
      [{ kind: 'po', targetId: 'p1', label: 'OC P1' }],
      { pos: [{ id: 'p1', createdById: 'u3' }], users: [person('u3')] },
      { memberIds: ['u3'] },
    );
    expect(n).toMatchObject({ userId: 'u3', type: 'chat.ref.po', target: { kind: 'po', id: 'p1' } });
  });
});

describe('ChatRefsService.backlinks y touched', () => {
  const link = (over: Record<string, unknown> = {}) => ({
    createdAt: new Date('2026-11-01T12:00:00Z'),
    message: {
      id: 'm1',
      body: 'revisa [@Ana](user:u1)',
      parentId: null,
      sender: { id: 'u2', fullName: 'Rita' },
      channel: {
        id: 'c1',
        name: 'general',
        kind: 'PUBLIC',
        isGroupDm: false,
        eventId: null,
        entity: 'ARTA',
        members: [],
        ...over,
      },
    },
  });

  it('solo muestra conversaciones que puedo leer', async () => {
    const { service } = setup({
      tasks: [taskRow()],
      refs: [link(), link({ id: 'c2', name: 'secreto', kind: 'PRIVATE' }), link({ id: 'c3', name: 'equipo', kind: 'PRIVATE', members: [{ userId: 'u1' }] })],
    });
    const { links } = await service.backlinks(production, 'task', 't1');
    expect(links.map((l) => l.channelId)).toEqual(['c1', 'c3']);
    expect(links[0]).toMatchObject({ channelName: '#general', excerpt: 'revisa @Ana', href: '/chat?channel=c1&msg=m1' });
  });

  it('no enseña menciones de algo que no puedo abrir', async () => {
    const { service } = setup({ pos: [poRow()] });
    await expect(service.backlinks(buyerAuditorio, 'po', 'cmpo00abc123')).rejects.toThrow('No encontrado');
    await expect(service.backlinks(production, 'po', 'cmpo00abc123')).rejects.toThrow('No encontrado');
  });

  it('avisa una vez a cada conversación que la menciona', async () => {
    const { service, realtime } = setup({ refs: [{ channelId: 'c1' }, { channelId: 'c2' }] });
    await service.touched('task', 't1');
    expect(realtime.emitToChannel).toHaveBeenCalledWith('c1', 'chat:refs-changed', { kind: 'task', id: 't1' });
    expect(realtime.emitToChannel).toHaveBeenCalledTimes(2);
  });
});
