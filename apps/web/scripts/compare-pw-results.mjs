#!/usr/bin/env node
/**
 * Compara dos corridas de Playwright (motor de Chrome contra motor de Safari) y
 * escribe en Markdown lo que falla SOLO en WebKit: eso es un fallo de Safari.
 * Lo que falla en los dos es de la prueba o de la app, no de Safari.
 *
 *   node scripts/compare-pw-results.mjs suite <base.json> <webkit.json> "<título>"
 *   node scripts/compare-pw-results.mjs audit <carpeta-base> <carpeta-webkit> <tag-base> <tag-webkit>
 *
 * `suite` lee el reporte JSON de Playwright (PLAYWRIGHT_JSON_OUTPUT_NAME) y sale
 * con código 1 si hay pruebas que pasan en Chromium y fallan en WebKit.
 * `audit` lee los JSON del recorrido de «cortes» (e2e/audit) y solo informa.
 * Lo usa .github/workflows/web-safari.yml; ver docs/SAFARI.md.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [mode, ...args] = process.argv.slice(2);

const stripAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
const firstLine = (s) =>
  stripAnsi(s)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' — ')
    .slice(0, 240);
const cell = (s) => String(s).replace(/\|/g, '\\|');

function readJson(file) {
  if (!existsSync(file)) {
    console.log(`> No existe \`${file}\`: la corrida no dejó reporte (¿se cayó el servidor o el build?).\n`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** clave → { outcome: passed|failed|flaky|skipped, error } */
function flatten(report) {
  const out = new Map();
  const walk = (suite, trail) => {
    const here = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const key = [...here, spec.title].join(' › ');
        const outcome =
          t.status === 'expected' ? 'passed' : t.status === 'flaky' ? 'flaky' : t.status === 'skipped' ? 'skipped' : 'failed';
        const last = (t.results || [])[t.results.length - 1] || {};
        const err = last.error?.message || (last.errors || [])[0]?.message || '';
        out.set(key, { outcome, error: firstLine(err) });
      }
    }
    for (const child of suite.suites || []) walk(child, here);
  };
  for (const s of report.suites || []) walk(s, []);
  return out;
}

function suite([baseFile, targetFile, title]) {
  const base = flatten(readJson(baseFile));
  const target = flatten(readJson(targetFile));
  const safariOnly = [];
  const both = [];
  const flaky = [];
  const fixed = [];
  const noBase = [];
  for (const [key, t] of target) {
    const b = base.get(key);
    if (!b) {
      if (t.outcome === 'failed') noBase.push([key, t]);
      continue;
    }
    const basePassed = b.outcome === 'passed' || b.outcome === 'flaky';
    if (t.outcome === 'failed' && basePassed) safariOnly.push([key, t]);
    else if (t.outcome === 'failed') both.push([key, t, b]);
    else if (t.outcome === 'flaky' && b.outcome === 'passed') flaky.push([key, t]);
    else if (t.outcome === 'passed' && b.outcome === 'failed') fixed.push([key, t]);
  }
  const count = (m, o) => [...m.values()].filter((x) => x.outcome === o).length;
  const lines = [];
  lines.push(`## ${title}`);
  lines.push('');
  lines.push(
    `WebKit: ${count(target, 'passed')} pasan · ${count(target, 'flaky')} inestables · ${count(target, 'failed')} fallan · ${count(target, 'skipped')} omitidas. ` +
      `Chromium (base): ${count(base, 'passed')} pasan · ${count(base, 'failed')} fallan.`,
  );
  lines.push('');
  if (safariOnly.length) {
    lines.push(`### ❌ Solo fallan en WebKit (${safariOnly.length}) — fallos de Safari`);
    lines.push('');
    lines.push('| Prueba | Error en WebKit |');
    lines.push('|---|---|');
    for (const [key, t] of safariOnly) lines.push(`| ${cell(key)} | ${cell(t.error)} |`);
    lines.push('');
  } else {
    lines.push('### ✅ Nada falla solo en WebKit');
    lines.push('');
  }
  if (noBase.length) {
    lines.push(`### Fallan en WebKit sin par en Chromium (${noBase.length})`);
    lines.push('');
    for (const [key, t] of noBase) lines.push(`- ${key} — ${t.error}`);
    lines.push('');
  }
  if (flaky.length) {
    lines.push(`### Inestables solo en WebKit (${flaky.length})`);
    lines.push('');
    for (const [key] of flaky) lines.push(`- ${key}`);
    lines.push('');
  }
  if (both.length) {
    lines.push(`<details><summary>Fallan en los dos motores (${both.length}) — no son de Safari</summary>`);
    lines.push('');
    for (const [key, t] of both) lines.push(`- ${key} — ${t.error}`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }
  if (fixed.length) {
    lines.push(`<details><summary>Pasan en WebKit y fallan en Chromium (${fixed.length})</summary>`);
    lines.push('');
    for (const [key] of fixed) lines.push(`- ${key}`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }
  console.log(lines.join('\n'));
  process.exit(safariOnly.length || noBase.length ? 1 : 0);
}

function audit([baseDir, targetDir, baseTag, targetTag]) {
  const KINDS = ['text', 'clip', 'scrollers', 'overlap', 'contrast'];
  const load = (dir, tag) => {
    const m = new Map();
    if (!existsSync(dir)) return m;
    for (const f of readdirSync(dir)) {
      const match = f.match(new RegExp(`^${tag}-(arta|audi)-(\\d+x\\d+)\\.json$`));
      if (!match) continue;
      for (const r of JSON.parse(readFileSync(join(dir, f), 'utf8'))) {
        const n = Object.fromEntries(KINDS.map((k) => [k, (r[k] || []).filter((i) => !i.justified).length]));
        n.hscroll = r.hscroll && r.hscroll.kind !== 'error' ? 1 : 0;
        n.error = r.hscroll?.kind === 'error' ? r.hscroll.detail : '';
        m.set(`${match[1]} ${match[2]} ${r.name}`, n);
      }
    }
    return m;
  };
  const base = load(baseDir, baseTag);
  const target = load(targetDir, targetTag);
  const lines = ['## Cortes (e2e/audit) — WebKit contra Chromium', ''];
  if (!target.size) {
    lines.push('> El recorrido en WebKit no dejó JSON.');
    console.log(lines.join('\n'));
    return;
  }
  const rows = [];
  for (const [key, t] of target) {
    const b = base.get(key) || {};
    const worse = [...KINDS, 'hscroll'].filter((k) => t[k] > (b[k] || 0)).map((k) => `${k} ${b[k] || 0}→${t[k]}`);
    if (t.error && !b.error) worse.push(`error: ${firstLine(t.error)}`);
    if (worse.length) rows.push(`| ${cell(key)} | ${cell(worse.join(' · '))} |`);
  }
  lines.push(`${target.size} pantallas medidas en WebKit, ${base.size} en Chromium.`);
  lines.push('');
  if (rows.length) {
    lines.push(`Pantallas con más hallazgos en WebKit que en Chromium (${rows.length}):`);
    lines.push('');
    lines.push('| Entidad · tamaño · pantalla | Hallazgo (Chromium→WebKit) |');
    lines.push('|---|---|');
    lines.push(...rows);
  } else {
    lines.push('WebKit no tiene ningún corte, encimado ni scroll lateral que Chromium no tenga.');
  }
  console.log(lines.join('\n'));
}

if (mode === 'suite') suite(args);
else if (mode === 'audit') audit(args);
else {
  console.error('uso: compare-pw-results.mjs suite|audit …');
  process.exit(2);
}
