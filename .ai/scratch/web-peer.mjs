// node web-peer.mjs <apiBase> — as SMOKE_B: typing, text, voice note (wav), pdf and a 👍 on the last message from someone else in #general.
import { createRequire } from 'module';

const require = createRequire(process.env.SMOKE_NODE_MODULES + '/');
const { io } = require('socket.io-client');
const base = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.SMOKE_B_EMAIL, password: process.env.SMOKE_B_PASS }),
});
const jar = {};
for (const c of login.headers.getSetCookie()) {
  const [pair] = c.split(';');
  const i = pair.indexOf('=');
  jar[pair.slice(0, i)] = pair.slice(i + 1);
}
const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const headers = { cookie, 'x-csrf-token': jar.arta_csrf };
const call = async (path, init = {}) => {
  const r = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};

const channels = await call('/chat/channels');
const general = channels.find((c) => c.slug === 'general');
const s = io(base, { path: '/socket.io', extraHeaders: { cookie }, transports: ['websocket'] });
await new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
console.log('join', await s.emitWithAck('chat:join', { channelId: general.id }));
for (let i = 0; i < 3; i++) {
  s.emit('chat:typing', { channelId: general.id });
  await sleep(1000);
}
await call(`/chat/channels/${general.id}/messages`, { method: 'POST', body: JSON.stringify({ body: 'Hola desde JP (en vivo)' }) });

// 1.2 s de tono 440 Hz, WAV 16 kHz mono
const rate = 16000, n = Math.round(rate * 1.2);
const wav = Buffer.alloc(44 + n * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

for (const [buf, name, mime] of [[wav, 'nota-de-voz-20260927-010203.wav', 'audio/wav'], [pdf, 'Cotización montaje.pdf', 'application/pdf']]) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), name);
  const up = await call('/chat/upload', { method: 'POST', body: form });
  await call(`/chat/channels/${general.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ attachmentUrl: up.url, attachmentName: up.name, attachmentMime: up.mime, attachmentSize: up.size }),
  });
  console.log('adjunto', up.name, up.mime, up.kind);
}

const page = await call(`/chat/channels/${general.id}/messages?limit=20`);
const theirs = [...page.messages].reverse().find((m) => m.author.id !== login && m.body?.startsWith('Prueba web'));
if (theirs) {
  await call(`/chat/messages/${theirs.id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji: '👍' }) });
  await call(`/chat/channels/${general.id}/messages`, { method: 'POST', body: JSON.stringify({ body: 'Respuesta en hilo', parentId: theirs.id }) });
  console.log('reacción + hilo en', theirs.id);
}
await call(`/chat/channels/${general.id}/read`, { method: 'POST' });
s.close();
console.log('ok');
