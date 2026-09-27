// node web-dm.mjs <apiBase> <toUserId> — as SMOKE_B, sends a direct message (it must raise the recipient's bell over the socket).
const [base, to] = process.argv.slice(2);
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
const headers = {
  cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
  'x-csrf-token': jar.arta_csrf,
  'Content-Type': 'application/json',
};
const dm = await (await fetch(`${base}/chat/dm`, { method: 'POST', headers, body: JSON.stringify({ userId: to }) })).json();
const r = await fetch(`${base}/chat/channels/${dm.id}/messages`, { method: 'POST', headers, body: JSON.stringify({ body: '¿Viste la cotización? (directo)' }) });
console.log('dm', dm.id, r.status);
