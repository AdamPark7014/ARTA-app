// Graba las respuestas del API que ven las apps con la cuenta de revisión (organización demo, datos
// inventados) para el modo demo de capturas: las apps las sirven desde un interceptor sin red ni login.
//
//   node apps/mobile-native/demo/grabar-fixtures.mjs [archivo-de-contraseña]
//
// Si Node falla con UNABLE_TO_GET_ISSUER_CERT (la cadena «Root YR» de Let's Encrypt), pásale los
// intermedios que manda el servidor:  NODE_EXTRA_CA_CERTS=cadena.pem node ...
// (cadena.pem = `openssl s_client -showcerts -connect arta.artaproducciones.com:443` sin el primer certificado).
// Resembrar la cuenta (resembrar-cuenta-revision.ps1) justo antes de grabar: las fechas salen de «hoy».
//
// La contraseña sale de la primera línea de C:\dev\secrets\arta-store\cuenta-revision.txt (fuera de git).
// No guarda cookies, tokens ni la contraseña; al final cierra la sesión que abrió.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://arta.artaproducciones.com/api';
const EMAIL = 'revision.tiendas@artaproducciones.com';
const FILE = process.argv[2] || 'C:\\dev\\secrets\\arta-store\\cuenta-revision.txt';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const password = readFileSync(FILE, 'utf8').split(/\r?\n/)[0];
let cookie = '';

async function call(method, path, body) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const set = res.headers.getSetCookie?.() || [];
  if (set.length) {
    const jar = new Map(cookie.split('; ').filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
    for (const c of set) {
      const [kv] = c.split(';');
      const [k, v] = kv.split(/=(.*)/s);
      jar.set(k, v);
    }
    cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* no JSON */ }
  return { status: res.status, json };
}

// Nada que parezca credencial sale del API hacia el repo.
const SECRET = /token|secret|password|cookie|csrf|totp|otp|recovery/i;
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET.test(k)).map(([k, x]) => [k, scrub(x)]));
  }
  return v;
}

const index = {};
function key(path, query = {}) {
  const q = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  return q ? `${path}?${q}` : path;
}
function fileFor(k) {
  return k.replace(/[?&=/]/g, (c) => ({ '?': '@', '&': '+', '=': '-', '/': '__' })[c]) + '.json';
}
async function grab(path, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const r = await call('GET', qs ? `${path}?${qs}` : path);
  const k = key(path, query);
  if (r.status !== 200) {
    console.log(`  ${r.status}  ${k}`);
    return null;
  }
  const f = fileFor(k);
  writeFileSync(join(OUT, f), JSON.stringify(scrub(r.json), null, 1));
  index[k] = f;
  console.log(`  200  ${k}`);
  return r.json;
}

const login = await call('POST', 'auth/login', { email: EMAIL, password });
if (login.status >= 300 || login.json?.requires2fa || login.json?.requiresTotpEnrollment) {
  console.error(`No entró (HTTP ${login.status}). No se grabó nada.`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

try {
  await grab('auth/me');
  for (const p of ['chat/channels', 'chat/unread', 'chat/colleagues', 'chat/prefs', 'chat/presence', 'chat/saved',
    'notifications', 'notifications/unread-count', 'users/directory', 'tasks/mine', 'tasks/requested', 'tasks/workload',
    'events', 'analytics/purchase-orders', 'purchase-orders/window', 'finance/advances/pending']) {
    await grab(p);
  }
  for (const scope of ['current', 'past', 'all']) await grab('events', { scope });
  for (const entity of ['ARTA', 'EXPLANADA']) {
    await grab('events', { entity });
    await grab('events', { entity, scope: 'current' });
    await grab('calendar/notes', { entity });
    await grab('analytics/purchase-orders', { entity });
  }

  const channels = (await call('GET', 'chat/channels')).json || [];
  for (const ch of Array.isArray(channels) ? channels : channels.items || []) {
    await grab(`chat/channels/${ch.id}`);
    await grab(`chat/channels/${ch.id}/messages`);
    await grab(`chat/channels/${ch.id}/pins`);
  }
  const ids = (x) => (Array.isArray(x) ? x : x?.items || x?.data || []).map((t) => t.id).filter(Boolean);
  const tasks = new Set([...ids((await call('GET', 'tasks/mine')).json), ...ids((await call('GET', 'tasks/requested')).json)]);
  for (const id of tasks) await grab(`tasks/${id}`);
  for (const id of ids((await call('GET', 'events')).json)) {
    await grab(`events/${id}`);
    await grab(`tasks/event/${id}`);
  }
  const pos = new Set(ids((await call('GET', 'analytics/purchase-orders')).json?.orders));
  for (const id of pos) await grab(`purchase-orders/${id}`);
} finally {
  await call('POST', 'auth/logout');
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
console.log(`\n${Object.keys(index).length} respuestas en ${OUT}`);
