// node web-session.mjs <apiBase> <outFile> — logs in with SMOKE_A_EMAIL/PASS and writes the session cookies (never the password).
import { writeFileSync } from 'fs';

const [base, out] = process.argv.slice(2);
const r = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.SMOKE_A_EMAIL, password: process.env.SMOKE_A_PASS }),
});
const jar = {};
for (const c of r.headers.getSetCookie()) {
  const [pair] = c.split(';');
  const i = pair.indexOf('=');
  jar[pair.slice(0, i)] = pair.slice(i + 1);
}
if (!r.ok || !jar.arta_access) throw new Error(`login: ${r.status}`);
writeFileSync(out, JSON.stringify(jar));
console.log('cookies', Object.keys(jar).join(','));
