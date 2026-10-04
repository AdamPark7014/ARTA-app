'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { Icon, ICONS } from './ChatAttachment';
import { attachmentLabel, isDeleted, listTime, plainText, type ChannelDetail, type ChatMessage, type Colleague, type SavedItem } from './chat-model';
import { Avatar, ChannelGlyph, errorText, untilLabel } from './chat-ui';

/* Paneles laterales: fijados, guardados e información del canal. */

export function MessageResult({
  m,
  where,
  now,
  onClick,
  extra,
}: {
  m: ChatMessage;
  where: string;
  now: Date;
  onClick: () => void;
  extra?: ReactNode;
}) {
  const text = isDeleted(m) ? 'Mensaje eliminado' : plainText(m.body) || (m.attachment ? attachmentLabel(m.attachment) : '');
  return (
    <div className="chat-result-wrap">
      <button type="button" className="chat-result" onClick={onClick}>
        <span className="chat-result__where">
          {where} · {listTime(m.createdAt, now)}
        </span>
        <span className="chat-result__body">
          <strong>{m.author.fullName.split(/\s+/)[0]}:</strong> {text}
        </span>
      </button>
      {extra}
    </div>
  );
}

function ListGhost() {
  return (
    <div className="chat-panel__ghost" aria-busy="true">
      {[70, 52, 64].map((w, i) => (
        <span key={i} className="skeleton skeleton--row" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function PanelEmpty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="chat-panel__empty">
      <span className="chat-panel__empty-icon">
        <Icon d={icon} size={20} />
      </span>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function PinsList({ pins, now, onJump }: { pins: ChatMessage[] | null; now: Date; onJump: (m: ChatMessage) => void }) {
  if (pins === null) return <ListGhost />;
  if (!pins.length) {
    return (
      <PanelEmpty icon={ICONS.pin} title="Nada fijado todavía">
        Fija mensajes importantes desde el menú ⋯ de cada mensaje.
      </PanelEmpty>
    );
  }
  return (
    <>
      {pins.map((m) => (
        <MessageResult key={m.id} m={m} where={m.author.fullName} now={now} onClick={() => onJump(m)} />
      ))}
    </>
  );
}

export function SavedList({
  items,
  error,
  now,
  onJump,
  onUnsave,
  onRetry,
}: {
  items: SavedItem[] | null;
  error: boolean;
  now: Date;
  onJump: (it: SavedItem) => void;
  onUnsave: (it: SavedItem) => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <PanelEmpty icon={ICONS.bookmark} title="No se pudieron cargar">
        <button type="button" className="btn ghost btn-sm" onClick={onRetry}>
          Reintentar
        </button>
      </PanelEmpty>
    );
  }
  if (items === null) return <ListGhost />;
  if (!items.length) {
    return (
      <PanelEmpty icon={ICONS.bookmark} title="Sin mensajes guardados">
        Usa el marcador de un mensaje para guardarlo y encontrarlo aquí.
      </PanelEmpty>
    );
  }
  return (
    <>
      {items.map((it) => (
        <MessageResult
          key={it.message.id}
          m={it.message}
          where={it.channel.kind === 'DIRECT' ? it.channel.name : it.channel.isGroupDm ? it.channel.name : `#${it.channel.name}`}
          now={now}
          onClick={() => onJump(it)}
          extra={
            <button type="button" className="chat-tool chat-tool--sm" aria-label="Quitar de guardados" title="Quitar de guardados" onClick={() => onUnsave(it)}>
              <Icon d={ICONS.close} size={14} />
            </button>
          }
        />
      ))}
    </>
  );
}

const MUTE_OPTIONS: { label: string; hours: number | null }[] = [
  { label: '8 horas', hours: 8 },
  { label: '1 semana', hours: 168 },
  { label: 'Siempre', hours: null },
];

export function ChannelInfo({
  detail,
  meId,
  isOnline,
  onSave,
  onMute,
  onLeave,
  onArchive,
  onAdd,
  onRemove,
  onOpenPins,
  onOpenDm,
  onError,
}: {
  detail: ChannelDetail;
  meId: string | null;
  isOnline: (id: string) => boolean;
  onSave: (patch: { name?: string; topic?: string; description?: string }) => Promise<void>;
  /** `false` activa avisos; `null` silencia para siempre. */
  onMute: (hours: number | null | false) => void;
  onLeave: () => void;
  onArchive: () => void;
  onAdd: (ids: string[]) => Promise<void>;
  onRemove: (userId: string) => void;
  onOpenPins: () => void;
  onOpenDm: (userId: string) => void;
  onError: (text: string) => void;
}) {
  const isDirect = detail.kind === 'DIRECT';
  const group = Boolean(detail.isGroupDm);
  const canEdit = !isDirect && (detail.canManage || group);
  const canMembers = detail.canManage && !isDirect && !group;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(detail.name);
  const [topic, setTopic] = useState(detail.topic ?? '');
  const [description, setDescription] = useState(detail.description ?? '');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Colleague[] | null>(null);
  const [memberQ, setMemberQ] = useState('');

  useEffect(() => {
    if (editing) return;
    setName(detail.name);
    setTopic(detail.topic ?? '');
    setDescription(detail.description ?? '');
  }, [detail.name, detail.topic, detail.description, editing]);

  useEffect(() => {
    if (!adding) return;
    const id = window.setTimeout(() => {
      api<Colleague[]>(`/chat/colleagues${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then(setFound)
        .catch(() => setFound([]));
    }, 200);
    return () => window.clearTimeout(id);
  }, [q, adding]);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({ name: name.trim().replace(/^#/, ''), topic: topic.trim(), description: description.trim() });
      setEditing(false);
    } catch (e) {
      onError(errorText(e, 'No se pudo guardar'));
    } finally {
      setBusy(false);
    }
  };

  const memberIds = new Set(detail.members.map((m) => m.id));
  const kindLabel = isDirect ? 'Mensaje directo' : group ? 'Grupo' : detail.kind === 'PRIVATE' ? 'Canal privado' : 'Canal público';
  const mutedText = !detail.muted ? 'Avisos activos' : detail.mutedUntil ? `Silenciado ${untilLabel(detail.mutedUntil)}` : 'Silenciado';
  const members = detail.members
    .filter((m) => !memberQ.trim() || m.fullName.toLowerCase().includes(memberQ.trim().toLowerCase()))
    .sort((a, b) => Number(isOnline(b.id)) - Number(isOnline(a.id)) || a.fullName.localeCompare(b.fullName, 'es'));

  return (
    <div className="chat-info">
      <section className="chat-info__hero">
        <ChannelGlyph c={detail} size="lg" online={isDirect && detail.peer ? isOnline(detail.peer.id) : undefined} />
        <div className="chat-info__hero-copy">
          <strong>{isDirect || group ? detail.name : `#${detail.name}`}</strong>
          <span>
            {kindLabel} · {detail.memberCount} {detail.memberCount === 1 ? 'miembro' : 'miembros'}
          </span>
        </div>
        {canEdit && !editing ? (
          <button type="button" className="btn ghost btn-sm" onClick={() => setEditing(true)}>
            Editar
          </button>
        ) : null}
      </section>

      {editing ? (
        <form
          className="chat-info__form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            <span>Nombre</span>
            <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          {group ? null : (
            <>
              <label>
                <span>Tema</span>
                <input type="text" value={topic} maxLength={250} placeholder="De qué se habla aquí" onChange={(e) => setTopic(e.target.value)} />
              </label>
              <label>
                <span>Descripción</span>
                <textarea value={description} maxLength={1000} rows={3} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </>
          )}
          <div className="chat-info__row-end">
            <button type="button" className="btn ghost btn-sm" onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-sm" disabled={busy || name.trim().replace(/^#/, '').length < 2}>
              Guardar
            </button>
          </div>
        </form>
      ) : detail.topic || detail.description ? (
        <section className="chat-info__section">
          {detail.topic ? (
            <div className="chat-info__field">
              <span>Tema</span>
              <p>{detail.topic}</p>
            </div>
          ) : null}
          {detail.description ? (
            <div className="chat-info__field">
              <span>Descripción</span>
              <p>{detail.description}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="chat-info__section">
        <div className="chat-info__label">
          <Icon d={detail.muted ? ICONS.bellOff : ICONS.bell} size={14} /> {mutedText}
        </div>
        <div className="chat-info__chips">
          {MUTE_OPTIONS.map((o) => (
            <button key={o.label} type="button" className="chat-chip" onClick={() => onMute(o.hours)}>
              Silenciar {o.label.toLowerCase()}
            </button>
          ))}
          {detail.muted ? (
            <button type="button" className="chat-chip is-on" onClick={() => onMute(false)}>
              Activar avisos
            </button>
          ) : null}
        </div>
        <button type="button" className="chat-info__link" onClick={onOpenPins}>
          <Icon d={ICONS.pin} size={15} /> Mensajes fijados
          <Icon d={ICONS.next} size={14} />
        </button>
      </section>

      <section className="chat-info__section">
        <div className="chat-info__label">
          <Icon d={ICONS.users} size={14} /> Miembros ({detail.memberCount})
          {canMembers ? (
            <button type="button" className="chat-link chat-info__label-act" onClick={() => setAdding((v) => !v)}>
              {adding ? 'Listo' : 'Agregar'}
            </button>
          ) : null}
        </div>
        {adding ? (
          <div className="chat-info__add">
            <input autoFocus type="text" placeholder="Buscar persona para agregar" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="chat-info__found">
              {found === null ? (
                <ListGhost />
              ) : (
                found
                  .filter((p) => !memberIds.has(p.id))
                  .slice(0, 8)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="chat-member"
                      onClick={() => {
                        void onAdd([p.id]).catch((e) => onError(errorText(e, 'No se pudo agregar')));
                      }}
                    >
                      <Avatar id={p.id} name={p.fullName} size="sm" online={isOnline(p.id)} />
                      <span className="chat-member__copy">
                        <span className="chat-member__name">{p.fullName}</span>
                        {p.title ? <span className="chat-member__meta">{p.title}</span> : null}
                      </span>
                      <Icon d={ICONS.plus} size={15} />
                    </button>
                  ))
              )}
            </div>
          </div>
        ) : null}
        {detail.members.length > 12 ? (
          <input className="chat-info__filter" type="text" placeholder="Filtrar miembros" value={memberQ} onChange={(e) => setMemberQ(e.target.value)} />
        ) : null}
        <div className="chat-info__members">
          {members.map((mm) => (
            <div key={mm.id} className="chat-member">
              <button type="button" className="chat-member__open" onClick={() => mm.id !== meId && onOpenDm(mm.id)} disabled={mm.id === meId}>
                <Avatar id={mm.id} name={mm.fullName} size="sm" online={isOnline(mm.id)} />
                <span className="chat-member__copy">
                  <span className="chat-member__name">
                    {mm.fullName}
                    {mm.id === meId ? <span className="chat-member__you"> (tú)</span> : null}
                  </span>
                  {mm.title ? <span className="chat-member__meta">{mm.title}</span> : null}
                </span>
                {mm.role === 'owner' || mm.role === 'admin' ? <span className="chat-badge">Admin</span> : null}
              </button>
              {canMembers && mm.id !== meId ? (
                <button type="button" className="chat-tool chat-tool--sm" aria-label={`Quitar a ${mm.fullName}`} title="Quitar del canal" onClick={() => onRemove(mm.id)}>
                  <Icon d={ICONS.close} size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {!isDirect ? (
        <section className="chat-info__section chat-info__danger">
          {detail.slug !== 'general' && detail.slug !== 'anuncios' ? (
            <button type="button" className="chat-info__link is-danger" onClick={onLeave}>
              <Icon d={ICONS.logout} size={15} /> {group ? 'Salir del grupo' : 'Salir del canal'}
            </button>
          ) : null}
          {detail.canManage && !group ? (
            <button type="button" className="chat-info__link is-danger" onClick={onArchive}>
              <Icon d={ICONS.archive} size={15} /> Archivar canal
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
