// node live-smoke.mjs <baseUrl> — needs SMOKE_A_EMAIL/PASS, SMOKE_B_EMAIL/PASS and socket.io-client resolvable
import { createRequire } from 'node:module';
const require = createRequire(process.env.SMOKE_NODE_MODULES + '/');
const { io } = require('socket.io-client');

const base = process.argv[2] || 'http://127.0.0.1:4099';
const socketPath = process.env.SMOKE_SOCKET_PATH || '/socket.io';

function jar() {
  const c = new Map();
  return {
    set(res) {
      for (const h of res.headers.getSetCookie?.() ?? []) {
        const [kv] = h.split(';');
        const i = kv.indexOf('=');
        c.set(kv.slice(0, i), kv.slice(i + 1));
      }
    },
    header: () => [...c].map(([k, v]) => `${k}=${v}`).join('; '),
    get: (k) => c.get(k),
  };
}

async function session(email, password) {
  const j = jar();
  const r = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  j.set(r);
  const body = await r.json();
  if (!r.ok || !j.get('arta_access')) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  const call = async (method, path, data) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        cookie: j.header(),
        'content-type': 'application/json',
        ...(method !== 'GET' ? { 'x-csrf-token': decodeURIComponent(j.get('arta_csrf') || '') } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    j.set(res);
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
  return { j, call, user: body.user };
}

const a = await session(process.env.SMOKE_A_EMAIL, process.env.SMOKE_A_PASS);
const b = await session(process.env.SMOKE_B_EMAIL, process.env.SMOKE_B_PASS);
console.log('login ok', a.user.email, b.user.email);

const channels = await a.call('GET', '/chat/channels');
const list = channels.channels ?? channels;
console.log('canales', list.map((c) => `${c.kind}:${c.slug ?? c.name}`).join(', '));
const general = list.find((c) => c.slug === 'general') ?? list[0];

const socket = io(base, { path: socketPath, transports: ['websocket'], extraHeaders: { cookie: a.j.header() } });
const got = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('sin chat:message en 8s')), 8000);
  socket.on('chat:message', (m) => { clearTimeout(t); resolve(m); });
  socket.on('connect_error', (e) => { clearTimeout(t); reject(e); });
});
await new Promise((resolve, reject) => {
  socket.on('connect', resolve);
  socket.on('connect_error', reject);
});
const joined = await socket.emitWithAck('chat:join', { channelId: general.id });
console.log('socket conectado, join', JSON.stringify(joined));

const posted = await b.call('POST', `/chat/channels/${general.id}/messages`, { body: `smoke ${new Date().toISOString()}` });
const live = await got;
console.log('en vivo', live.id === (posted.message?.id ?? posted.id) ? 'OK' : 'id distinto', live.body);

const unread = await a.call('GET', '/chat/unread');
console.log('unread a', JSON.stringify(unread));
await a.call('POST', `/chat/channels/${general.id}/read`);
const del = await b.call('DELETE', `/chat/messages/${live.id}`);
console.log('borrado', JSON.stringify(del).slice(0, 80));

const readEvent = new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), 4000);
  socket.once('notification:read', (p) => { clearTimeout(t); resolve(p); });
});
const mention = await b.call('POST', `/chat/channels/${general.id}/messages`, { body: `aviso [@${a.user.fullName}](user:${a.user.id})` });
await new Promise((r) => setTimeout(r, 700));
const before = await a.call('GET', '/notifications/unread-count');
const all = await a.call('POST', '/notifications/read-all');
const evt = await readEvent;
await b.call('DELETE', `/chat/messages/${mention.message?.id ?? mention.id}`);
console.log('avisos sin leer', before.count, '→ read-all', all.updated, 'socket', evt ? JSON.stringify(evt) : (all.updated ? 'SIN EVENTO' : 'n/a (nada que leer)'));
socket.close();
