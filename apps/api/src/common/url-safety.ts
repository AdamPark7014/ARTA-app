import { BadRequestException } from '@nestjs/common';

/**
 * Blocks server-side-fetched URLs (webhook endpoints, etc.) from targeting
 * internal infrastructure. A tenant admin configuring a webhook is not the
 * same trust level as whoever operates the network — without this, they
 * could point a webhook at cloud metadata (169.254.169.254), the internal
 * db/Docker service names, or localhost and use delivery status as an
 * SSRF probe. This blocks IP-literal and hostname-literal internal
 * targets; it does not resolve DNS to catch rebinding to a private IP
 * behind a public hostname (would require pinning the resolved address
 * at connect time), so treat it as the first line of defense, not proof.
 */

function ipv4ToNum(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    num = num * 256 + n;
  }
  return num;
}

const PRIVATE_V4_RANGES: Array<[string, string]> = [
  ['0.0.0.0', '0.255.255.255'],
  ['10.0.0.0', '10.255.255.255'],
  ['100.64.0.0', '100.127.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['224.0.0.0', '255.255.255.255'],
];

function isPrivateIpv4(ip: string): boolean {
  const num = ipv4ToNum(ip);
  if (num === null) return false;
  return PRIVATE_V4_RANGES.some(([start, end]) => {
    const s = ipv4ToNum(start)!;
    const e = ipv4ToNum(end)!;
    return num >= s && num <= e;
  });
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  // IPv6 loopback / unspecified / link-local / unique-local
  if (host === '::1' || host === '::') return true;
  if (/^fe80:/i.test(host) || /^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  const v4Mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (v4Mapped) return isPrivateIpv4(v4Mapped[1]);

  if (isPrivateIpv4(host)) return true;

  // Bare/single-label hostnames (no dot) are never legitimate public webhook
  // targets — they only resolve inside a private network (Docker/K8s DNS).
  if (!host.includes('.')) return true;

  return false;
}

export function assertPublicHttpUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('URL inválida');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('Solo se permiten URLs http/https');
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new BadRequestException('No se permite un destino de red interna');
  }
}
