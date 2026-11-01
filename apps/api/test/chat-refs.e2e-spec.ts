import { PrismaClient } from '@prisma/client';
import { ChatRefsService } from '../src/chat/chat-refs.service';
import { ChatService } from '../src/chat/chat.service';
import { NotificationsService } from '../src/notifications/notifications.service';

/**
 * Chat con referencias contra una base real. Las pruebas unitarias usan Prisma de mentira y
 * `notify` se traga sus errores: el 01-11-2026 el modelo llegó a producción sin su tabla y
 * todo se veía en verde. Aquí se escribe y se lee de verdad.
 */
describe('Chat con referencias (e2e, base real)', () => {
  const prisma = new PrismaClient();
  const realtime = { emitToChannel: jest.fn(), emitToUsers: jest.fn(), emitToUser: jest.fn() };
  const notifications = new NotificationsService(prisma as never, undefined, realtime as never);
  const refs = new ChatRefsService(prisma as never, notifications, realtime as never);
  const chat = new ChatService(prisma as never, notifications, realtime as never, refs);

  const suffix = Date.now().toString(36);
  let orgId: string;
  let eventId: string;
  let taskId: string;
  let channelId: string;
  const ids: Record<'author' | 'owner' | 'requester' | 'stranger', string> = {
    author: '',
    owner: '',
    requester: '',
    stranger: '',
  };

  const viewer = (key: keyof typeof ids, entities = ['ARTA'], roleKey = 'gerente_arta') => ({
    id: ids[key],
    roleKey,
    organizationId: orgId,
    entities,
    fullName: `Persona ${key}`,
  });

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { slug: `org-refs-${suffix}`, name: 'Org refs' } });
    orgId = org.id;
    for (const key of Object.keys(ids) as Array<keyof typeof ids>) {
      const user = await prisma.user.create({
        data: {
          email: `${key}-${suffix}@example.com`,
          passwordHash: 'x',
          fullName: `Persona ${key}`,
          roleKey: key === 'stranger' ? 'dir_auditorio' : 'gerente_arta',
          entities: key === 'stranger' ? ['EXPLANADA'] : ['ARTA'],
          organizationId: orgId,
        },
      });
      ids[key] = user.id;
    }
    const event = await prisma.event.create({
      data: { organizationId: orgId, entity: 'ARTA', name: 'Noche de prueba', status: 'ACTIVE' },
    });
    eventId = event.id;
    const task = await prisma.taskAssignment.create({
      data: {
        organizationId: orgId,
        entity: 'ARTA',
        eventId,
        title: 'Cotizar luces',
        status: 'OPEN',
        assigneeId: ids.owner,
        createdById: ids.requester,
      },
    });
    taskId = task.id;
    const channel = await prisma.chatChannel.create({
      data: {
        organizationId: orgId,
        kind: 'PUBLIC',
        slug: `refs-${suffix}`,
        name: `refs-${suffix}`,
        entity: 'ARTA',
        members: { create: [{ userId: ids.author }, { userId: ids.owner }] },
      },
    });
    channelId = channel.id;
  });

  afterAll(async () => {
    const users = Object.values(ids);
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.chatMessage.deleteMany({ where: { channelId } });
    await prisma.chatChannel.deleteMany({ where: { id: channelId } });
    await prisma.taskAssignment.deleteMany({ where: { id: taskId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it('guarda la referencia, la lee con tarjeta y avisa con lo que trata', async () => {
    const sent = await chat.postMessage(viewer('author'), channelId, {
      body: 'revisa @Cotizar luces',
      refs: [{ kind: 'task', id: taskId }],
    });
    expect(sent.refs[0]).toMatchObject({
      kind: 'task',
      id: taskId,
      label: 'Cotizar luces',
      canOpen: true,
      statusLabel: 'Pendiente',
    });

    const page = await chat.listMessages(viewer('owner'), channelId, {});
    const listed = page.messages.find((m) => m.id === sent.id)!;
    expect(listed.refs[0]).toMatchObject({ canOpen: true, actions: ['deliver'] });

    // El aviso sale después de responder: se espera a que aparezca.
    let notice = null;
    for (let i = 0; i < 40 && !notice; i += 1) {
      notice = await prisma.notification.findFirst({ where: { userId: ids.owner, type: 'chat.ref.task' } });
      if (!notice) await new Promise((r) => setTimeout(r, 100));
    }
    expect(notice).toMatchObject({ targetKind: 'task', targetId: taskId });
  });

  it('el otro negocio ve la etiqueta, sin estado ni liga', async () => {
    const cards = await refs.cards(viewer('stranger', ['EXPLANADA'], 'dir_auditorio'), [{ kind: 'task', id: taskId }]);
    expect(cards.get(`task:${taskId}`)).toMatchObject({ canOpen: false, statusLabel: null, href: null });
  });

  it('la búsqueda y «Mencionado en» consultan de verdad', async () => {
    const { results } = await refs.search(viewer('author'), { q: 'cotizar', channelId });
    expect(results.map((r) => r.id)).toContain(taskId);
    const { links } = await refs.backlinks(viewer('author'), 'task', taskId);
    expect(links[0]).toMatchObject({ channelId, excerpt: 'revisa @Cotizar luces' });
    const panel = await chat.channelRefs(viewer('author'), channelId);
    expect(panel.refs[0]).toMatchObject({ id: taskId, count: 1 });
  });
});
