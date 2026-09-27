import { PrismaClient } from '@prisma/client';
import { ChatService } from '../../apps/api/src/chat/chat.service';

async function main() {
  const prisma = new PrismaClient();
  const pushes: Array<[string, any]> = [];
  const notes: any[] = [];
  const events: any[] = [];
  const notifications = {
    pushOnly: async (u: string, p: any) => { pushes.push([u, p]); return 1; },
    notifyMany: async (n: any[]) => { notes.push(...n); return []; },
  };
  const realtime = new Proxy({}, { get: (_t, k) => (...a: any[]) => events.push([k, a[1] ?? a[0]]) });
  const chat = new ChatService(prisma as any, notifications as any, realtime as any);
  const ana = { id: 'ua', roleKey: 'logistica', organizationId: null, fullName: 'Ana Ruiz' };
  const beto = { id: 'ub', roleKey: 'dir_general', organizationId: null, fullName: 'Beto Paz' };

  console.log('unread ana antes', await chat.unreadTotal(ana));
  const list = await chat.listChannels(ana);
  console.log('canales ana', list.map((c) => `${c.kind}:${c.name}:${c.unreadCount}:${c.canPost}`));
  const general = list.find((c) => c.slug === 'general')!;
  const anuncios = list.find((c) => c.slug === 'anuncios')!;
  const posted = await chat.postMessage(ana, general.id, { body: 'Prueba [@Beto Paz](user:ub) y más' });
  await new Promise((r) => setTimeout(r, 500));
  console.log('push', pushes.map(([u, p]) => `${u}:${p.title}:${p.badge}`), 'menciones', notes.map((n) => n.userId));
  console.log('unread beto', await chat.unreadTotal(beto));
  const reply = await chat.postMessage(beto, general.id, { body: 'en hilo', parentId: posted.id });
  const thread = await chat.getThread(ana, reply.id);
  console.log('hilo', thread.root.replyCount, thread.replies.length);
  await chat.toggleReaction(beto, posted.id, '👍');
  await chat.togglePin(beto, posted.id);
  console.log('pins', (await chat.listPins(ana, general.id)).messages.length);
  const page = await chat.listMessages(ana, general.id, { limit: 2 });
  const older = await chat.listMessages(ana, general.id, { before: page.messages[0].id, limit: 10 });
  console.log('pagina', page.messages.map((m) => m.body), 'antes', older.messages.map((m) => m.body));
  const around = await chat.listMessages(ana, general.id, { around: posted.id, limit: 4 });
  console.log('around', around.messages.map((m) => m.id === posted.id ? '*' : m.body));
  await chat.markRead(beto, general.id);
  console.log('unread beto tras leer', await chat.unreadTotal(beto));
  try { await chat.postMessage(ana, anuncios.id, { body: 'x' }); } catch (e: any) { console.log('anuncios ana:', e.message); }
  await chat.postMessage(beto, anuncios.id, { body: 'Aviso oficial' });
  const dm = await chat.openDirect(ana, 'ub');
  console.log('dm', dm.name, dm.members.length);
  await chat.setMuted(beto, dm.id, true, 8);
  pushes.length = 0;
  await chat.postMessage(ana, dm.id, { body: 'silenciado?' });
  await new Promise((r) => setTimeout(r, 300));
  console.log('push a beto silenciado', pushes.filter(([u, p]) => u === 'ub' && !p.silent).length);
  console.log('busqueda', (await chat.searchMessages(ana, 'prueba')).messages.length);
  console.log('legacy', (await chat.legacyThreads(ana)).threads.map((t) => `${t.key}:${t.unread}`));
  const legacyMsgs = await chat.legacyMessages(ana, 'general');
  console.log('legacy msgs', legacyMsgs.length, JSON.stringify(legacyMsgs[1]?.body));
  await chat.deleteMessage(beto, posted.id);
  console.log('tras borrar', (await chat.listMessages(ana, general.id)).messages.length);
  try { await chat.getChannel({ id: 'uc', roleKey: 'logistica', organizationId: 'org2' }, general.id); } catch (e: any) { console.log('otra org:', e.message); }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
