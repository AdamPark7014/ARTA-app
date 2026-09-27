// node web-activity.mjs <apiBase> — A listens to chat:channel-activity; B sends A a DM and then mutes nothing. Prints what A receives.
import { createRequire } from 'module';

const require = createRequire(process.env.SMOKE_NODE_MODULES + '/');
const { io } = require('socket.io-client');
const base = process.argv[2];

async function session(email, password) {
  const r = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const jar = {};
  for (const c of r.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar[pair.slice(0, i)] = pair.slice(i + 1);
  }
  const body = await r.json();
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  return { user: body.user, cookie, headers: { cookie, 'x-csrf-token': jar.arta_csrf, 'Content-Type': 'application/json' } };
}

const a = await session(process.env.SMOKE_A_EMAIL, process.env.SMOKE_A_PASS);
const b = await session(process.env.SMOKE_B_EMAIL, process.env.SMOKE_B_PASS);
const s = io(base, { path: '/socket.io', extraHeaders: { cookie: a.cookie }, transports: ['websocket'] });
await new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
const got = new Promise((res) => s.on('chat:channel-activity', res));
const dm = await (await fetch(`${base}/chat/dm`, { method: 'POST', headers: b.headers, body: JSON.stringify({ userId: a.user.id }) })).json();
await fetch(`${base}/chat/channels/${dm.id}/messages`, { method: 'POST', headers: b.headers, body: JSON.stringify({ body: 'Aviso de escritorio' }) });
const p = await Promise.race([got, new Promise((r) => setTimeout(() => r('timeout'), 5000))]);
console.log(JSON.stringify(p));
s.close();
