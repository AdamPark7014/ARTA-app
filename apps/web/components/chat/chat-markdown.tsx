'use client';

import { Fragment, useMemo, type ReactNode } from 'react';

/*
 * Formato de texto del chat (contrato chat v2 §7), igual en web, Android e iOS:
 * *negrita*, _cursiva_, ~tachado~, `código`, ```bloque```, > cita, listas,
 * enlaces sueltos, menciones `[@Nombre](user:<id>)` y `@canal`.
 * Parser puro → árbol → nodos de React; nunca HTML crudo.
 */

export type MdInline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'bold' | 'italic' | 'strike'; c: MdInline[] }
  | { t: 'link'; href: string; v: string }
  | { t: 'mention'; name: string; id: string }
  | { t: 'channel'; v: string };

export type MdBlock =
  | { t: 'p'; c: MdInline[] }
  | { t: 'pre'; v: string }
  | { t: 'quote'; c: MdBlock[] }
  | { t: 'ul'; items: MdInline[][] }
  | { t: 'ol'; start: number; items: MdInline[][] };

const MENTION_AT = /\[@([^\]\n]{1,80})\]\(user:([A-Za-z0-9_-]{1,64})\)/y;
const URL_AT = /https?:\/\/[^\s<>]+[^\s<>.,;:!?)\]'"*_~`]/y;
const CHANNEL_AT = /@(canal|channel)(?![\p{L}\p{N}_])/uy;
const MARKS: Record<string, 'bold' | 'italic' | 'strike'> = { '*': 'bold', _: 'italic', '~': 'strike' };
const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

function matchAt(re: RegExp, s: string, at: number) {
  re.lastIndex = at;
  return re.exec(s);
}

function isWord(c: string | undefined) {
  return c !== undefined && WORD.test(c);
}

/** Cierre del marcador `ch` abierto en `i`, saltando código, menciones y enlaces. */
function findCloser(s: string, i: number, ch: string) {
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === '\n') return -1;
    if (c === '`') {
      const k = s.indexOf('`', j + 1);
      if (k > j) {
        j = k;
        continue;
      }
    }
    if (c === '[') {
      const m = matchAt(MENTION_AT, s, j);
      if (m) {
        j += m[0].length - 1;
        continue;
      }
    }
    if (c === 'h' && !isWord(s[j - 1])) {
      const m = matchAt(URL_AT, s, j);
      if (m) {
        j += m[0].length - 1;
        continue;
      }
    }
    if (c === ch && j > i + 1 && !SPACE.test(s[j - 1]) && !isWord(s[j + 1])) return j;
  }
  return -1;
}

export function parseInline(s: string, depth = 0): MdInline[] {
  const out: MdInline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '`') {
      const fence = s.startsWith('```', i) ? s.indexOf('```', i + 3) : -1;
      if (fence > i + 3) {
        flush();
        out.push({ t: 'code', v: s.slice(i + 3, fence) });
        i = fence + 3;
        continue;
      }
      const j = s.indexOf('`', i + 1);
      if (j > i + 1 && !s.slice(i + 1, j).includes('\n')) {
        flush();
        out.push({ t: 'code', v: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    } else if (c === '[') {
      const m = matchAt(MENTION_AT, s, i);
      if (m) {
        flush();
        out.push({ t: 'mention', name: m[1].trim(), id: m[2] });
        i += m[0].length;
        continue;
      }
    } else if (c === 'h' && !isWord(s[i - 1])) {
      const m = matchAt(URL_AT, s, i);
      if (m) {
        flush();
        out.push({ t: 'link', href: m[0], v: m[0] });
        i += m[0].length;
        continue;
      }
    } else if (c === '@' && !isWord(s[i - 1])) {
      const m = matchAt(CHANNEL_AT, s, i);
      if (m) {
        flush();
        out.push({ t: 'channel', v: m[0] });
        i += m[0].length;
        continue;
      }
    } else if (MARKS[c] && depth < 4) {
      const next = s[i + 1];
      if (!isWord(s[i - 1]) && next !== undefined && !SPACE.test(next) && next !== c) {
        const j = findCloser(s, i, c);
        if (j > i + 1) {
          flush();
          out.push({ t: MARKS[c], c: parseInline(s.slice(i + 1, j), depth + 1) });
          i = j + 1;
          continue;
        }
      }
    }
    buf += c;
    i += 1;
  }
  flush();
  return out;
}

const QUOTE = /^>\s?/;
const UL = /^\s{0,3}[-*•]\s+(.*)$/;
const OL = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;

function parseLines(lines: string[], depth: number): MdBlock[] {
  const out: MdBlock[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push({ t: 'p', c: parseInline(para.join('\n')) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lead = line.trimStart();

    if (lead.startsWith('```')) {
      const first = lead.slice(3);
      const sameLine = first.indexOf('```');
      if (sameLine >= 0) {
        flushPara();
        out.push({ t: 'pre', v: first.slice(0, sameLine) });
        const rest = first.slice(sameLine + 3).trim();
        if (rest) para.push(rest);
        continue;
      }
      const body = first.trim() ? [first] : [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        const k = lines[j].indexOf('```');
        if (k >= 0) {
          if (k > 0) body.push(lines[j].slice(0, k));
          closed = true;
          break;
        }
        body.push(lines[j]);
      }
      if (closed) {
        flushPara();
        out.push({ t: 'pre', v: body.join('\n') });
        const rest = lines[j].slice(lines[j].indexOf('```') + 3).trim();
        if (rest) para.push(rest);
        i = j;
        continue;
      }
    }

    if (depth < 3 && QUOTE.test(line)) {
      flushPara();
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(lines[i].replace(QUOTE, ''));
        i += 1;
      }
      i -= 1;
      out.push({ t: 'quote', c: parseLines(quoted, depth + 1) });
      continue;
    }

    if (UL.test(line) && !/^\s{0,3}\*\S/.test(line)) {
      flushPara();
      const items: MdInline[][] = [];
      while (i < lines.length && UL.test(lines[i])) {
        items.push(parseInline(UL.exec(lines[i])![1]));
        i += 1;
      }
      i -= 1;
      out.push({ t: 'ul', items });
      continue;
    }

    const ol = OL.exec(line);
    if (ol) {
      flushPara();
      const items: MdInline[][] = [];
      while (i < lines.length && OL.test(lines[i])) {
        items.push(parseInline(OL.exec(lines[i])![2]));
        i += 1;
      }
      i -= 1;
      out.push({ t: 'ol', start: Number(ol[1]) || 1, items });
      continue;
    }

    para.push(line);
  }
  flushPara();
  return out;
}

export function parseMarkdown(text: string): MdBlock[] {
  return parseLines(text.replace(/\r\n?/g, '\n').split('\n'), 0);
}

/** Primer enlace fuera de código: el de la tarjeta de vista previa. */
export function firstLink(text: string): string | null {
  const walkInline = (nodes: MdInline[]): string | null => {
    for (const n of nodes) {
      if (n.t === 'link') return n.href;
      if (n.t === 'bold' || n.t === 'italic' || n.t === 'strike') {
        const hit = walkInline(n.c);
        if (hit) return hit;
      }
    }
    return null;
  };
  const walk = (blocks: MdBlock[]): string | null => {
    for (const b of blocks) {
      const hit =
        b.t === 'p'
          ? walkInline(b.c)
          : b.t === 'quote'
            ? walk(b.c)
            : b.t === 'ul' || b.t === 'ol'
              ? b.items.reduce<string | null>((acc, it) => acc ?? walkInline(it), null)
              : null;
      if (hit) return hit;
    }
    return null;
  };
  return text.includes('http') ? walk(parseMarkdown(text)) : null;
}

const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*){1,3}$/u;

/** 1 a 3 emojis sin texto: se pintan grandes. */
export function isEmojiOnly(text: string) {
  const t = text.replace(/\s+/g, '');
  return t.length > 0 && t.length <= 24 && EMOJI_ONLY.test(t);
}

type RenderOpts = { meId?: string | null; onMention?: (id: string) => void };

function renderInline(nodes: MdInline[], o: RenderOpts): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>;
      case 'code':
        return (
          <code key={i} className="chat-md-code">
            {n.v}
          </code>
        );
      case 'bold':
        return <strong key={i}>{renderInline(n.c, o)}</strong>;
      case 'italic':
        return <em key={i}>{renderInline(n.c, o)}</em>;
      case 'strike':
        return <s key={i}>{renderInline(n.c, o)}</s>;
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {n.v}
          </a>
        );
      case 'mention': {
        const cls = `chat-mention${o.meId && n.id === o.meId ? ' is-me' : ''}`;
        return o.onMention ? (
          <button
            key={i}
            type="button"
            className={cls}
            onClick={(e) => {
              e.stopPropagation();
              o.onMention?.(n.id);
            }}
          >
            @{n.name}
          </button>
        ) : (
          <span key={i} className={cls}>
            @{n.name}
          </span>
        );
      }
      case 'channel':
        return (
          <span key={i} className="chat-mention chat-mention--channel">
            {n.v}
          </span>
        );
    }
  });
}

function renderBlocks(blocks: MdBlock[], o: RenderOpts): ReactNode[] {
  return blocks.map((b, i) => {
    switch (b.t) {
      case 'p':
        return (
          <p key={i} className="chat-md-p">
            {renderInline(b.c, o)}
          </p>
        );
      case 'pre':
        return (
          <pre key={i} className="chat-md-pre">
            <code>{b.v}</code>
          </pre>
        );
      case 'quote':
        return (
          <blockquote key={i} className="chat-md-quote">
            {renderBlocks(b.c, o)}
          </blockquote>
        );
      case 'ul':
        return (
          <ul key={i} className="chat-md-list">
            {b.items.map((it, k) => (
              <li key={k}>{renderInline(it, o)}</li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={i} className="chat-md-list" start={b.start}>
            {b.items.map((it, k) => (
              <li key={k}>{renderInline(it, o)}</li>
            ))}
          </ol>
        );
    }
  });
}

export function ChatMarkdown({ text, meId, onMention }: { text: string } & RenderOpts) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <>{renderBlocks(blocks, { meId, onMention })}</>;
}

/** Una línea (vista previa de lista, citas): solo formato en línea, sin bloques. */
export function ChatInline({ text, meId }: { text: string; meId?: string | null }) {
  const nodes = useMemo(() => parseInline(text.replace(/\s*\n\s*/g, ' ')), [text]);
  return <>{renderInline(nodes, { meId })}</>;
}
