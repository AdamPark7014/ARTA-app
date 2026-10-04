'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '@/lib/api';
import { Icon, ICONS } from './ChatAttachment';
import { fold, plainText, type ChannelDetail, type ChannelSummary, type Colleague } from './chat-model';
import { Avatar, ChannelGlyph, errorText, isDirectLike, Modal, PanelHead } from './chat-ui';

const GROUP_MAX = 8;

function useColleagues(q: string, enabled = true, minLength = 0) {
  const [people, setPeople] = useState<Colleague[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const term = q.trim();
    if (term.length < minLength) {
      setPeople([]);
      return;
    }
    const id = window.setTimeout(() => {
      api<Colleague[]>(`/chat/colleagues${term ? `?q=${encodeURIComponent(term)}` : ''}`)
        .then(setPeople)
        .catch(() => setPeople([]));
    }, 200);
    return () => window.clearTimeout(id);
  }, [q, enabled, minLength]);
  return people;
}

/** Nuevo directo (1 persona), directo de grupo (2 a 8) o canal con miembros iniciales. */
export function NewConversation({
  initialMode,
  meId,
  onClose,
  onOpen,
  onError,
}: {
  initialMode: 'dm' | 'channel';
  meId: string | null;
  onClose: () => void;
  onOpen: (id: string) => void;
  onError: (text: string) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Colleague[]>([]);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [privateChannel, setPrivateChannel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const people = useColleagues(q);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () => (people ?? []).filter((p) => p.id !== meId && !picked.some((x) => x.id === p.id)).slice(0, 40),
    [people, picked, meId],
  );

  useEffect(() => setActive(0), [q, mode]);

  const toggle = (p: Colleague) => {
    setPicked((cur) => {
      if (cur.some((x) => x.id === p.id)) return cur.filter((x) => x.id !== p.id);
      if (mode === 'dm' && cur.length >= GROUP_MAX) {
        onError(`Un grupo admite hasta ${GROUP_MAX} personas además de ti`);
        return cur;
      }
      return [...cur, p];
    });
    setQ('');
    inputRef.current?.focus();
  };

  const openDm = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      const c =
        picked.length === 1
          ? await api<ChannelDetail>('/chat/dm', { method: 'POST', body: JSON.stringify({ userId: picked[0].id }) })
          : await api<ChannelDetail>('/chat/group-dm', { method: 'POST', body: JSON.stringify({ userIds: picked.map((p) => p.id) }) });
      onOpen(c.id);
    } catch (e) {
      onError(errorText(e, 'No se pudo abrir la conversación'));
    } finally {
      setBusy(false);
    }
  };

  const cleanName = name.trim().replace(/^#/, '');
  const createChannel = async () => {
    if (cleanName.length < 2 || busy) return;
    setBusy(true);
    try {
      const c = await api<{ id: string }>('/chat/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: cleanName,
          kind: privateChannel ? 'PRIVATE' : 'PUBLIC',
          topic: topic.trim() || undefined,
          memberIds: picked.length ? picked.map((p) => p.id) : undefined,
        }),
      });
      onOpen(c.id);
    } catch (e) {
      onError(errorText(e, 'No se pudo crear el canal'));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!visible.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + d + visible.length) % visible.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (q.trim() && visible[active]) toggle(visible[active]);
      else if (mode === 'dm') void openDm();
      else void createChannel();
    } else if (e.key === 'Backspace' && !q && picked.length) {
      setPicked((cur) => cur.slice(0, -1));
    }
  };

  const dmLabel = picked.length > 1 ? `Crear grupo (${picked.length + 1})` : 'Abrir conversación';

  return (
    <Modal label={mode === 'dm' ? 'Nueva conversación' : 'Nuevo canal'} onClose={onClose} className="chat-modal__card--new">
      <PanelHead title={mode === 'dm' ? 'Nueva conversación' : 'Nuevo canal'} onClose={onClose} />
      <div className="chat-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'dm'} className={mode === 'dm' ? 'is-on' : ''} onClick={() => setMode('dm')}>
          Mensaje directo
        </button>
        <button type="button" role="tab" aria-selected={mode === 'channel'} className={mode === 'channel' ? 'is-on' : ''} onClick={() => setMode('channel')}>
          Canal
        </button>
      </div>

      {mode === 'channel' ? (
        <div className="chat-modal__form">
          <label className="chat-field">
            <span>Nombre</span>
            <span className="chat-field__prefix">
              <b>#</b>
              <input autoFocus type="text" placeholder="produccion-gira" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </span>
          </label>
          <label className="chat-field">
            <span>Tema (opcional)</span>
            <input type="text" placeholder="De qué se habla aquí" maxLength={250} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label className="chat-modal__check">
            <input type="checkbox" checked={privateChannel} onChange={(e) => setPrivateChannel(e.target.checked)} />
            <span>
              Privado
              <small>Solo lo ven las personas que invites</small>
            </span>
          </label>
        </div>
      ) : null}

      <div className="chat-modal__form">
        <span className="chat-field__label">{mode === 'dm' ? 'Para' : 'Miembros (opcional)'}</span>
        <div className="chat-people" onClick={() => inputRef.current?.focus()}>
          {picked.map((p) => (
            <span key={p.id} className="chat-chip is-on">
              {p.fullName}
              <button type="button" aria-label={`Quitar a ${p.fullName}`} onClick={() => toggle(p)}>
                <Icon d={ICONS.close} size={12} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            autoFocus={mode === 'dm'}
            type="text"
            placeholder={picked.length ? 'Agregar otra persona' : 'Buscar por nombre'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>

      <div className="chat-modal__list" role="listbox">
        {people === null ? (
          <p className="chat-list__none">Cargando…</p>
        ) : visible.length === 0 ? (
          <p className="chat-list__none">Sin resultados</p>
        ) : (
          visible.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`chat-row${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => toggle(p)}
            >
              <Avatar id={p.id} name={p.fullName} size="sm" />
              <span className="chat-row__main">
                <span className="chat-row__name">{p.fullName}</span>
                {p.title ? <span className="chat-row__preview">{p.title}</span> : null}
              </span>
              <Icon d={ICONS.plus} size={15} />
            </button>
          ))
        )}
      </div>

      <footer className="chat-modal__foot">
        <span className="chat-modal__hint">
          {mode === 'dm'
            ? picked.length > 1
              ? `Directo de grupo con ${picked.length} personas`
              : `Elige una persona, o varias (hasta ${GROUP_MAX}) para un grupo`
            : privateChannel
              ? 'Canal privado'
              : 'Cualquiera del equipo puede unirse'}
        </span>
        {mode === 'dm' ? (
          <button type="button" className="btn" disabled={busy || !picked.length} onClick={() => void openDm()}>
            {dmLabel}
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy || cleanName.length < 2} onClick={() => void createChannel()}>
            Crear canal
          </button>
        )}
      </footer>
    </Modal>
  );
}

type SwitchItem = { kind: 'channel'; c: ChannelSummary } | { kind: 'person'; p: Colleague };

/** Ctrl/Cmd+K: saltar a un canal o abrir un directo con alguien. */
export function QuickSwitcher({
  channels,
  meId,
  isOnline,
  onSelect,
  onOpenDm,
  onClose,
}: {
  channels: ChannelSummary[];
  meId: string | null;
  isOnline: (id: string) => boolean;
  onSelect: (channelId: string) => void;
  onOpenDm: (userId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const people = useColleagues(q, true, 2);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<SwitchItem[]>(() => {
    const f = fold(q.trim());
    const chans = channels
      .filter((c) => !f || fold(c.name).includes(f))
      .sort((a, b) => Number(b.unreadCount > 0) - Number(a.unreadCount > 0) || (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
      .slice(0, 10)
      .map<SwitchItem>((c) => ({ kind: 'channel', c }));
    const peers = new Set(channels.filter((c) => c.kind === 'DIRECT').map((c) => c.peer?.id));
    const ppl = (people ?? [])
      .filter((p) => p.id !== meId && !peers.has(p.id))
      .slice(0, 5)
      .map<SwitchItem>((p) => ({ kind: 'person', p }));
    return [...chans, ...ppl];
  }, [q, channels, people, meId]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (it: SwitchItem | undefined) => {
    if (!it) return;
    onClose();
    if (it.kind === 'channel') onSelect(it.c.id);
    else onOpenDm(it.p.id);
  };

  return (
    <Modal label="Ir a una conversación" onClose={onClose} className="chat-modal__card--switcher">
      <div className="chat-switcher__input">
        <Icon d={ICONS.search} size={16} />
        <input
          autoFocus
          type="text"
          placeholder="Ir a canal o persona…"
          aria-label="Ir a canal o persona"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (!items.length) return;
              const d = e.key === 'ArrowDown' ? 1 : -1;
              setActive((a) => (a + d + items.length) % items.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(items[active]);
            }
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="chat-modal__list" role="listbox" ref={listRef}>
        {items.length === 0 ? (
          <p className="chat-list__none">Sin resultados</p>
        ) : (
          items.map((it, i) => (
            <button
              key={it.kind === 'channel' ? it.c.id : `p-${it.p.id}`}
              type="button"
              role="option"
              data-i={i}
              aria-selected={i === active}
              className={`chat-row chat-row--dense${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(it)}
            >
              {it.kind === 'channel' ? (
                <>
                  <ChannelGlyph c={it.c} size="sm" online={it.c.kind === 'DIRECT' && it.c.peer ? isOnline(it.c.peer.id) : undefined} />
                  <span className="chat-row__main">
                    <span className="chat-row__name">{isDirectLike(it.c) ? it.c.name : `#${it.c.name}`}</span>
                    {it.c.lastMessagePreview ? <span className="chat-row__preview">{plainText(it.c.lastMessagePreview)}</span> : null}
                  </span>
                  {it.c.unreadCount > 0 ? <span className="chat-row__badge">{it.c.unreadCount > 99 ? '99+' : it.c.unreadCount}</span> : null}
                </>
              ) : (
                <>
                  <Avatar id={it.p.id} name={it.p.fullName} size="sm" online={isOnline(it.p.id)} />
                  <span className="chat-row__main">
                    <span className="chat-row__name">{it.p.fullName}</span>
                    <span className="chat-row__preview">{it.p.title || 'Enviar mensaje directo'}</span>
                  </span>
                </>
              )}
            </button>
          ))
        )}
      </div>
      <footer className="chat-switcher__foot">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> navegar
        </span>
        <span>
          <kbd>Enter</kbd> abrir
        </span>
        <span>
          <kbd>Esc</kbd> cerrar
        </span>
      </footer>
    </Modal>
  );
}
