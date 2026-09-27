import { attachmentLabel } from './chat-attachments';

/**
 * Texto del chat. Las menciones viajan como `[@Nombre](user:<id>)` para que el
 * cliente las pinte como chip y el API sepa a quién avisar sin adivinar por nombre.
 */

const MENTION_TOKEN = /\[@?([^\]\n]+)\]\(user:([a-z0-9]+)\)/gi;
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const CHANNEL_MENTION = /(^|\s)@(canal|todos|channel|here)\b/i;
export const PREVIEW_MAX = 140;

/** Vista previa legible para la lista de conversaciones y el aviso del teléfono. */
export function chatPreview(body: string | null | undefined, max = PREVIEW_MAX): string {
  const raw = (body ?? '').trim();
  if (!raw) return '';
  const clean = raw
    .replace(MENTION_TOKEN, '@$1')
    .replace(MARKDOWN_LINK, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Ids mencionados, sin el autor. */
export function mentionedUserIds(body: string | null | undefined, authorId: string): Set<string> {
  const ids = new Set<string>();
  for (const match of (body ?? '').matchAll(MENTION_TOKEN)) {
    const id = match[2];
    if (id && id !== authorId) ids.add(id);
  }
  return ids;
}

/** `@canal` / `@todos`: avisa a todo el canal aunque lo tengan silenciado. */
export function mentionsChannel(body: string | null | undefined): boolean {
  return CHANNEL_MENTION.test(body ?? '');
}

export function slugify(name: string, max = 60): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

/** Texto del aviso: adjuntos por su tipo («📷 Foto», «🎤 Nota de voz», «📄 x.pdf»). */
export function pushText(message: {
  body: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMime?: string | null;
}): string {
  const text = chatPreview(message.body);
  if (!message.attachmentUrl) return text || 'Mensaje nuevo';
  const label = attachmentLabel(message.attachmentUrl, message.attachmentName, message.attachmentMime);
  return text ? `${label} · ${text}` : label;
}

/** Directo entre dos personas: ids ordenados (igual que el backfill en SQL con colación C). */
export function dmKeyOf(a: string, b: string): string {
  return [a, b].sort().join(':');
}
