'use client';

import { getCsrfToken } from '@/lib/api';

/* Chat en canales (el mismo API que Android e iPhone): tipos, fechas, adjuntos y notas de voz. */

export type ChatPeer = { id: string; fullName: string; title?: string | null };

export type ChannelKind = 'PUBLIC' | 'PRIVATE' | 'DIRECT';

export type ChannelSummary = {
  id: string;
  kind: ChannelKind;
  slug?: string | null;
  name: string;
  topic?: string | null;
  eventId?: string | null;
  peer?: ChatPeer | null;
  isMember: boolean;
  memberCount: number;
  postingRestricted: boolean;
  canPost: boolean;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  unreadCount: number;
  muted: boolean;
  mutedUntil?: string | null;
};

export type ChannelMember = {
  id: string;
  fullName: string;
  title?: string | null;
  role: string;
  lastReadAt?: string | null;
};

export type ChannelDetail = {
  id: string;
  kind: ChannelKind;
  slug?: string | null;
  name: string;
  topic?: string | null;
  description?: string | null;
  eventId?: string | null;
  peer?: ChatPeer | null;
  postingRestricted: boolean;
  canPost: boolean;
  canManage: boolean;
  muted: boolean;
  mutedUntil?: string | null;
  lastReadAt?: string | null;
  memberCount: number;
  members: ChannelMember[];
};

export type ChatAttachment = { url: string; name?: string | null; mime?: string | null; size?: number | null };

export type ChatReaction = {
  emoji: string;
  count: number;
  userIds: string[];
  users: { id: string; fullName: string }[];
};

export type ChatMessage = {
  id: string;
  channelId: string;
  parentId?: string | null;
  kind: 'TEXT' | 'SYSTEM';
  body: string;
  attachment?: ChatAttachment | null;
  pinnedAt?: string | null;
  editedAt?: string | null;
  createdAt: string;
  author: { id: string; fullName: string; title?: string | null };
  replyCount: number;
  reactions: ChatReaction[];
  clientId?: string | null;
  /** Solo en el cliente: optimista mientras responde el API. */
  pending?: boolean;
  failed?: boolean;
  /** Solo en resultados de búsqueda. */
  channel?: { id: string; name: string; kind: ChannelKind };
};

export type MessagePage = { messages: ChatMessage[]; hasMore: boolean; hasNewer?: boolean };
export type Colleague = { id: string; fullName: string; title?: string | null; email?: string | null };
export type UploadResult = { url: string; name?: string | null; mime?: string | null; size?: number | null };

export const MAX_LEN = 4000;
export const MAX_BYTES = 100 * 1024 * 1024;
export const EDIT_WINDOW_MS = 60 * 60_000;
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '✅', '👀', '🔥'];

/* ── texto y fechas ─────────────────────────────────────────────────────── */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const HUES = [42, 24, 158, 188, 212, 252, 298, 346];

export function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function hueOf(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return HUES[Math.abs(h) % HUES.length];
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayDiff(d: Date, now: Date) {
  return Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
}

export function clock(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function listTime(iso: string, now: Date) {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff <= 0) return clock(d);
  if (diff === 1) return 'ayer';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

function dayLabel(d: Date, now: Date) {
  const diff = dayDiff(d, now);
  if (diff <= 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  const label = d.toLocaleDateString('es-MX', opts).replace(',', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function fullStamp(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatBytes(n?: number | null) {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function mmss(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ── lista de mensajes ──────────────────────────────────────────────────── */

function byTime(a: ChatMessage, b: ChatMessage) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Une por id; un mensaje del servidor con `clientId` reemplaza a su optimista. */
export function upsertMessages(list: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of list) byId.set(m.id, m);
  for (const m of incoming) {
    if (m.clientId) {
      byId.forEach((v, k) => {
        if (k !== m.id && v.clientId === m.clientId && (v.pending || v.failed)) byId.delete(k);
      });
    }
    byId.set(m.id, m);
  }
  return Array.from(byId.values()).sort(byTime);
}

export function patchMessage(list: ChatMessage[], updated: ChatMessage): ChatMessage[] {
  return list.some((m) => m.id === updated.id) ? list.map((m) => (m.id === updated.id ? updated : m)) : list;
}

export type Block =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'system'; key: string; message: ChatMessage }
  | { kind: 'group'; key: string; mine: boolean; authorId: string; authorName: string; items: ChatMessage[] };

const GROUP_GAP = 5 * 60_000;

export function buildBlocks(list: ChatMessage[], meId: string | null, now: Date): Block[] {
  const blocks: Block[] = [];
  let lastDay = -1;
  let group: Extract<Block, { kind: 'group' }> | null = null;
  for (const m of list) {
    const d = new Date(m.createdAt);
    const day = startOfDay(d);
    if (day !== lastDay) {
      blocks.push({ kind: 'day', key: `d-${day}`, label: dayLabel(d, now) });
      lastDay = day;
      group = null;
    }
    if (m.kind === 'SYSTEM') {
      blocks.push({ kind: 'system', key: `s-${m.id}`, message: m });
      group = null;
      continue;
    }
    const prev = group ? group.items[group.items.length - 1] : null;
    if (group && prev && group.authorId === m.author.id && d.getTime() - new Date(prev.createdAt).getTime() <= GROUP_GAP) {
      group.items.push(m);
    } else {
      group = {
        kind: 'group',
        key: `g-${m.id}`,
        mine: m.author.id === meId,
        authorId: m.author.id,
        authorName: m.author.fullName,
        items: [m],
      };
      blocks.push(group);
    }
  }
  return blocks;
}

/* ── adjuntos: misma tabla que el API ───────────────────────────────────── */

export type AttachmentKind = 'image' | 'video' | 'audio' | 'document';

const BY_EXT: Record<string, { mime: string; kind: AttachmentKind }> = {
  jpg: { mime: 'image/jpeg', kind: 'image' },
  jpeg: { mime: 'image/jpeg', kind: 'image' },
  png: { mime: 'image/png', kind: 'image' },
  gif: { mime: 'image/gif', kind: 'image' },
  webp: { mime: 'image/webp', kind: 'image' },
  heic: { mime: 'image/heic', kind: 'image' },
  heif: { mime: 'image/heif', kind: 'image' },
  mp4: { mime: 'video/mp4', kind: 'video' },
  m4v: { mime: 'video/mp4', kind: 'video' },
  mov: { mime: 'video/quicktime', kind: 'video' },
  '3gp': { mime: 'video/3gpp', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' },
  m4a: { mime: 'audio/mp4', kind: 'audio' },
  aac: { mime: 'audio/aac', kind: 'audio' },
  mp3: { mime: 'audio/mpeg', kind: 'audio' },
  ogg: { mime: 'audio/ogg', kind: 'audio' },
  opus: { mime: 'audio/ogg', kind: 'audio' },
  wav: { mime: 'audio/wav', kind: 'audio' },
  pdf: { mime: 'application/pdf', kind: 'document' },
  doc: { mime: 'application/msword', kind: 'document' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
  xls: { mime: 'application/vnd.ms-excel', kind: 'document' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'document' },
  ppt: { mime: 'application/vnd.ms-powerpoint', kind: 'document' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document' },
  pages: { mime: 'application/vnd.apple.pages', kind: 'document' },
  numbers: { mime: 'application/vnd.apple.numbers', kind: 'document' },
  key: { mime: 'application/vnd.apple.keynote', kind: 'document' },
  zip: { mime: 'application/zip', kind: 'document' },
  csv: { mime: 'text/csv', kind: 'document' },
  txt: { mime: 'text/plain', kind: 'document' },
};

const BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

export const ACCEPT = Object.keys(BY_EXT)
  .map((e) => `.${e}`)
  .join(',');

export function extOf(name?: string | null) {
  const clean = (name || '').split(/[?#]/)[0];
  const i = clean.lastIndexOf('.');
  return i >= 0 ? clean.slice(i + 1).toLowerCase() : '';
}

function baseName(name: string) {
  const i = name.lastIndexOf('.');
  return (i > 0 ? name.slice(0, i) : name) || 'archivo';
}

export function kindOf(a: ChatAttachment): AttachmentKind {
  const m = (a.mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m) return 'document';
  return BY_EXT[extOf(a.name) || extOf(a.url)]?.kind ?? 'document';
}

/** Grabada en la app (Android, iPhone o web): se pinta como nota de voz, no como archivo. */
export function isVoiceNote(a: ChatAttachment) {
  return kindOf(a) === 'audio' && /^nota[-_ ]de[-_ ]voz/i.test(a.name || '');
}

export function attachmentLabel(a: ChatAttachment) {
  switch (kindOf(a)) {
    case 'image':
      return '📷 Foto';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return isVoiceNote(a) ? '🎤 Nota de voz' : `🎵 ${a.name || 'Audio'}`;
    default:
      return `📄 ${a.name || 'Documento'}`;
  }
}

/* ── preparar y subir ───────────────────────────────────────────────────── */

export type PreparedUpload = { blob: Blob; name: string; mime: string };

export class UploadError extends Error {}

/** Nombre con una extensión que el API acepta; si falta, se deduce del tipo. */
function fileNameFor(name: string, mime: string): string | null {
  const ext = extOf(name);
  if (BY_EXT[ext]) return name;
  const byMime = BY_MIME[mime.toLowerCase().split(';')[0]];
  return byMime ? `${baseName(name || 'archivo')}.${byMime}` : null;
}

/** Foto grande o HEIC → JPEG de 2560 px, igual que las apps. `null` si el navegador no la decodifica. */
async function toJpeg(blob: Blob, name: string): Promise<PreparedUpload | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    return null;
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return out ? { blob: out, name: `${baseName(name)}.jpg`, mime: 'image/jpeg' } : null;
}

export async function prepareFile(file: File): Promise<PreparedUpload> {
  const name = fileNameFor(file.name || '', file.type || '');
  if (!name) throw new UploadError(`«${file.name || 'Archivo'}» no se puede compartir en el chat`);
  const ext = extOf(name);
  const rule = BY_EXT[ext];
  const mime = ext === 'webm' && file.type.startsWith('audio/') ? 'audio/webm' : rule.mime;
  if (rule.kind === 'image' && ext !== 'gif') {
    const heic = ext === 'heic' || ext === 'heif';
    const big = file.size > (ext === 'jpg' || ext === 'jpeg' ? 1.5 : 5) * 1024 * 1024;
    if (heic || big) {
      const jpeg = await toJpeg(file, name);
      if (jpeg) return jpeg;
    }
  }
  if (file.size > MAX_BYTES) throw new UploadError(`«${file.name}» pesa más de 100 MB`);
  if (file.size === 0) throw new UploadError(`«${file.name}» está vacío`);
  return { blob: file, name, mime };
}

/** `XMLHttpRequest` porque `fetch` no reporta el avance de subida. */
export function uploadFile(
  p: PreparedUpload,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/chat/upload');
    xhr.withCredentials = true;
    const csrf = getCsrfToken();
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { message?: string | string[] } & Partial<UploadResult> = {};
      try {
        body = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* respuesta vacía */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url) {
        resolve(body as UploadResult);
        return;
      }
      const msg = Array.isArray(body.message) ? body.message[0] : body.message;
      reject(new UploadError(msg || (xhr.status === 413 ? 'El archivo pesa más de 100 MB' : `No se pudo subir (${xhr.status})`)));
    };
    xhr.onerror = () => reject(new UploadError('Sin conexión'));
    xhr.onabort = () => reject(new UploadError('Cancelado'));
    signal?.addEventListener('abort', () => xhr.abort());
    const form = new FormData();
    form.append('file', new File([p.blob], p.name, { type: p.mime }));
    xhr.send(form);
  });
}

/* ── notas de voz ───────────────────────────────────────────────────────── */

/** AAC en .m4a si el navegador lo graba (Safari); si no, WAV: los dos suenan nativos en iPhone y Android. */
const AAC_MIME = 'audio/mp4;codecs=mp4a.40.2';
export const VOICE_MAX_MS = 10 * 60_000;

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function toWav(blob: Blob, rate = 16_000): Promise<Blob> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const length = Math.max(1, Math.ceil(decoded.duration * rate));
  const off = new OfflineAudioContext(1, length, rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}

export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  startedAt = 0;

  static supported() {
    return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const aac = MediaRecorder.isTypeSupported(AAC_MIME);
    this.rec = aac ? new MediaRecorder(this.stream, { mimeType: AAC_MIME }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(1_000);
    this.startedAt = Date.now();
  }

  /** `null` si duró menos de un segundo. */
  async stop(): Promise<PreparedUpload | null> {
    const rec = this.rec;
    if (!rec) return null;
    const elapsed = Date.now() - this.startedAt;
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      if (rec.state !== 'inactive') rec.stop();
      else resolve();
    });
    this.release();
    if (elapsed < 1_000 || !this.chunks.length) return null;
    const type = rec.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type });
    const base = `nota-de-voz-${stamp()}`;
    if (type.startsWith('audio/mp4')) return { blob, name: `${base}.m4a`, mime: 'audio/mp4' };
    try {
      return { blob: await toWav(blob), name: `${base}.wav`, mime: 'audio/wav' };
    } catch {
      const ogg = type.includes('ogg');
      return { blob, name: `${base}.${ogg ? 'ogg' : 'webm'}`, mime: ogg ? 'audio/ogg' : 'audio/webm' };
    }
  }

  cancel() {
    if (this.rec && this.rec.state !== 'inactive') {
      this.rec.onstop = null;
      this.rec.stop();
    }
    this.release();
    this.chunks = [];
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
  }
}
