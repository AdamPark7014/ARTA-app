import { lookup as dnsLookup, promises as dnsPromises, type LookupAddress } from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';
import * as zlib from 'node:zlib';

/**
 * Vista previa de enlaces del chat (`GET /chat/link-preview`).
 *
 * El servidor hace la petición, así que todo se protege contra SSRF: solo http/https,
 * cada salto (≤3 redirecciones) se revalida y la IP se comprueba al conectar (no solo
 * al validar) para que un DNS que cambia entre ambos pasos no llegue a la red interna.
 */

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

type Resolver = (host: string) => Promise<Array<{ address: string }>>;

const TIMEOUT_MS = 4000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const MAX_URL = 2048;
const CACHE_TTL_MS = 24 * 3600_000;
const CACHE_FAIL_TTL_MS = 3600_000;
const CACHE_MAX = 500;
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

const V4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((n, octet) => ((n << 8) + Number(octet)) >>> 0, 0);
}

function v4Blocked(n: number): boolean {
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
  });
}

function expandV6(raw: string): number[] | null {
  let s = raw.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    if (isIP(v4[1]) !== 4) return null;
    const n = ipv4ToInt(v4[1]);
    s = `${s.slice(0, -v4[1].length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  let groups = head;
  if (parts.length === 2) {
    const tail = parts[1] ? parts[1].split(':') : [];
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...Array<string>(fill).fill('0'), ...tail];
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.some((n) => Number.isNaN(n)) ? null : nums;
}

function v6Blocked(g: number[]): boolean {
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  const embedded = (hi: number, lo: number) => v4Blocked(((hi << 16) | lo) >>> 0);
  if (zero(0, 7) && g[7] <= 1) return true; // :: y ::1
  if (zero(0, 5) && g[5] === 0xffff) return embedded(g[6], g[7]); // ::ffff:a.b.c.d
  if (zero(0, 6)) return embedded(g[6], g[7]); // ::a.b.c.d (obsoleto)
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return embedded(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return embedded(g[1], g[2]); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 privada
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link/site-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentación
  if (g[0] === 0x100 && zero(1, 4)) return true; // descarte
  return false;
}

/** IP privada, loopback, link-local, reservada o ilegible (falla cerrado). */
export function isPrivateAddress(ip: string): boolean {
  const clean = ip.trim().replace(/^\[|\]$/g, '');
  const kind = isIP(clean.split('%')[0]);
  if (kind === 4) return v4Blocked(ipv4ToInt(clean));
  if (kind === 6) {
    const groups = expandV6(clean);
    return !groups || v6Blocked(groups);
  }
  return true;
}

const defaultResolver: Resolver = (host) => dnsPromises.lookup(host, { all: true, verbatim: true });

/** URL pública y segura para pedir, o null. Valida esquema, puerto, credenciales y DNS. */
export async function publicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL | null> {
  if (!raw || raw.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || !ALLOWED_PORTS.has(url.port)) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return null;
  if (isIP(host.split('%')[0])) return isPrivateAddress(host) ? null : url;
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(host) || !host.includes('.')) {
    return null;
  }
  try {
    const addresses = await resolve(host);
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) return null;
  } catch {
    return null;
  }
  return url;
}

/** Revalida la IP en el momento de conectar (defensa contra DNS rebinding). */
const safeLookup = (
  hostname: string,
  options: { all?: boolean } | number | undefined,
  callback: (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void,
) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error('Dirección no permitida'), { code: 'EBLOCKED' }));
    }
    if (typeof options === 'object' && options?.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
};

type RawResponse = { status: number; location?: string; type?: string; body?: Buffer };

function request(url: URL, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        signal,
        lookup: safeLookup as unknown as http.RequestOptions['lookup'],
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; ARTA-LinkPreview/1.0)',
          accept: 'text/html',
          'accept-encoding': 'gzip, deflate, br',
          'accept-language': 'es-MX,es;q=0.9,en;q=0.5',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        if (status !== 200 || !/^\s*text\/html/i.test(type)) {
          res.resume();
          return resolve({ status, type });
        }
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          enc === 'gzip'
            ? res.pipe(zlib.createGunzip())
            : enc === 'deflate'
              ? res.pipe(zlib.createInflate())
              : enc === 'br'
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve({ status, type, body: Buffer.concat(chunks) });
        };
        stream.on('data', (chunk: Buffer) => {
          if (done) return;
          const take = Math.min(chunk.length, MAX_BYTES - size);
          chunks.push(take < chunk.length ? chunk.subarray(0, take) : chunk);
          size += take;
          if (size >= MAX_BYTES) {
            finish();
            req.destroy();
          }
        });
        stream.on('end', finish);
        stream.on('error', (e) => {
          if (!done) reject(e);
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function decodeBody(body: Buffer, contentType?: string): string {
  const sniff = body.subarray(0, 2048).toString('latin1');
  const charset =
    contentType?.match(/charset=["']?([\w-]+)/i)?.[1] ??
    sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(charset.toLowerCase()).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

function clip(value: string | null | undefined, max: number): string | null {
  const v = value?.replace(/\s+/g, ' ').trim();
  if (!v) return null;
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function absoluteHttp(value: string | null, base: URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Lee `og:*`, `twitter:*` y `<title>`; sin título ni descripción no hay tarjeta. */
export function parseLinkPreview(html: string, pageUrl: URL): LinkPreview | null {
  const meta = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attrsOf(tag[0]);
    const key = (attrs.property || attrs.name || '').toLowerCase();
    const content = attrs.content ? decodeEntities(attrs.content).trim() : '';
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find(Boolean) ?? null;
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = clip(pick('og:title', 'twitter:title') ?? (titleTag ? decodeEntities(titleTag) : null), 200);
  const description = clip(pick('og:description', 'twitter:description', 'description'), 300);
  if (!title && !description) return null;
  return {
    url: pageUrl.toString(),
    title,
    description,
    image: absoluteHttp(
      pick('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'),
      pageUrl,
    ),
    siteName: clip(pick('og:site_name', 'application-name'), 100) ?? pageUrl.hostname.replace(/^www\./, ''),
  };
}

async function load(raw: string): Promise<LinkPreview | null> {
  let url = await publicUrl(raw);
  if (!url) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const res = await request(url, ctrl.signal);
      if (res.location) {
        if (hop === MAX_REDIRECTS) return null;
        url = await publicUrl(new URL(res.location, url).toString());
        if (!url) return null;
        continue;
      }
      if (!res.body) return null;
      const preview = parseLinkPreview(decodeBody(res.body, res.type), url);
      return preview ? { ...preview, url: raw } : null;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { at: number; ttl: number; value: LinkPreview | null }>();
const inFlight = new Map<string, Promise<LinkPreview | null>>();

function remember(key: string, value: LinkPreview | null) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), ttl: value ? CACHE_TTL_MS : CACHE_FAIL_TTL_MS, value });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Nunca lanza: cualquier fallo (red, SSRF, tipo, tamaño) es «sin vista previa». */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  const key = (rawUrl ?? '').trim();
  if (!key || key.length > MAX_URL) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= hit.ttl) return hit.value;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const job = load(key)
    .catch(() => null)
    .then((value) => {
      remember(key, value);
      inFlight.delete(key);
      return value;
    });
  inFlight.set(key, job);
  return job;
}
