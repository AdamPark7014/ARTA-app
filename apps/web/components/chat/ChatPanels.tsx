'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { Icon, ICONS } from './ChatAttachment';
import {
  attachmentLabel,
  isAnnouncementsSlug,
  isDeleted,
  isGeneralSlug,
  listTime,
  plainText,
  reportReasonLabel,
  type ChannelDetail,
  type ChannelSummary,
  type ChatMessage,
  type ChatReport,
  type Colleague,
  type ReportStatus,
  type SavedItem,
} from './chat-model';
import { REF_GROUPS, refKey, type ChatRef, type RefAction } from './chat-refs';
import { RefCard } from './RefCard';
import { Avatar, ChannelGlyph, channelDisplayName, channelWhere, errorText, untilLabel } from './chat-ui';

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
  channels,
  error,
  now,
  onJump,
  onUnsave,
  onRetry,
}: {
  items: SavedItem[] | null;
  channels?: ChannelSummary[] | null;
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
          where={channelWhere(it.channel, channels)}
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

const EXCERPT_MAX = 180;

/**
 * Cola de reportes (solo dirección): quién reportó a quién, por qué, el fragmento del
 * mensaje y dónde está. «Ver mensaje» salta a él; «Marcar resuelto» lo cierra.
 */
export function ReportsList({
  items,
  status,
  error,
  busyId,
  now,
  channels,
  onStatus,
  onJump,
  onResolve,
  onRetry,
}: {
  items: ChatReport[] | null;
  status: ReportStatus;
  error: boolean;
  busyId: string | null;
  now: Date;
  channels?: ChannelSummary[] | null;
  onStatus: (next: ReportStatus) => void;
  onJump: (r: ChatReport) => void;
  onResolve: (r: ChatReport, next: ReportStatus) => void;
  onRetry: () => void;
}) {
  const tabs = (
    <div className="chat-info__chips chat-reports__tabs" role="tablist" aria-label="Estado de los reportes">
      {(['OPEN', 'RESOLVED'] as ReportStatus[]).map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={status === s}
          className={`chat-chip${status === s ? ' is-on' : ''}`}
          onClick={() => onStatus(s)}
        >
          {s === 'OPEN' ? 'Abiertos' : 'Resueltos'}
        </button>
      ))}
    </div>
  );
  let body: ReactNode;
  if (error) {
    body = (
      <PanelEmpty icon={ICONS.flag} title="No se pudieron cargar">
        <button type="button" className="btn ghost btn-sm" onClick={onRetry}>
          Reintentar
        </button>
      </PanelEmpty>
    );
  } else if (items === null) {
    body = <ListGhost />;
  } else if (!items.length) {
    body = (
      <PanelEmpty icon={ICONS.flag} title={status === 'OPEN' ? 'Sin reportes abiertos' : 'Sin reportes resueltos'}>
        {status === 'OPEN' ? 'Cuando alguien reporte un mensaje desde su menú ⋯, aparece aquí.' : null}
      </PanelEmpty>
    );
  } else {
    body = items.map((r) => {
      const msg = r.message;
      // Dónde está. Un directo o privado del que no soy parte no se abre (el API lo negaría):
      // se dice dónde fue y «Ver mensaje» queda apagado.
      const kind = msg?.channelKind ?? 'PUBLIC';
      const known = msg ? (channels?.find((c) => c.id === msg.channelId) ?? null) : null;
      const display = msg ? (known ? channelDisplayName(known) : msg.channelName) : '';
      const where = !msg
        ? ''
        : kind === 'DIRECT'
          ? `en el directo con ${display.replace(/^#/, '')}`
          : kind === 'PRIVATE'
            ? `en ${display.replace(/^#/, '')} (privado)`
            : `en ${known ? display : `#${display}`}`;
      const canOpen = Boolean(known) || kind === 'PUBLIC';
      const text = msg ? plainText(msg.body) : '';
      const excerpt = text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX).trimEnd()}…` : text;
      return (
        <article key={r.id} className="chat-report-card" aria-label={`Reporte de ${r.reporter.name}`}>
          <header className="chat-report-card__head">
            <span className="chat-badge">{reportReasonLabel(r.reason)}</span>
            <span className="chat-report-card__time">{listTime(r.createdAt, now)}</span>
          </header>
          <p className="chat-report-card__who">
            <strong>{r.reporter.name}</strong> reportó a <strong>{r.reportedUser?.name ?? 'una persona que ya no está'}</strong>
            {where ? <> {where}</> : null}
          </p>
          {r.details ? <p className="chat-report-card__details">{r.details}</p> : null}
          {msg ? (
            <blockquote className="chat-report-card__excerpt">{excerpt || 'Adjunto sin texto'}</blockquote>
          ) : (
            <p className="chat-report-card__excerpt is-deleted">El mensaje ya no existe.</p>
          )}
          <div className="chat-report-card__actions">
            {msg ? (
              <button
                type="button"
                className="btn ghost btn-sm"
                disabled={!canOpen}
                title={canOpen ? undefined : 'Solo visible para sus miembros'}
                onClick={() => onJump(r)}
              >
                Ver mensaje
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-sm"
              disabled={busyId === r.id}
              onClick={() => onResolve(r, status === 'OPEN' ? 'RESOLVED' : 'OPEN')}
            >
              {busyId === r.id ? 'Guardando…' : status === 'OPEN' ? 'Marcar resuelto' : 'Reabrir'}
            </button>
          </div>
        </article>
      );
    });
  }
  return (
    <div className="chat-reports">
      {tabs}
      {body}
    </div>
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
          <strong>{channelDisplayName(detail)}</strong>
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
          {!isGeneralSlug(detail.slug) && !isAnnouncementsSlug(detail.slug) ? (
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

type LinkedRef = ChatRef & { messageId: string; at: string; count: number };

/** Panel «Ligados»: todo lo que se ha arrobado en esta conversación, con su estado de hoy. */
export function LinkedList({
  channelId,
  live,
  onAction,
  busyKey,
  onJump,
}: {
  channelId: string;
  live: Record<string, ChatRef>;
  onAction: (r: ChatRef, action: RefAction) => void;
  busyKey: string | null;
  onJump: (messageId: string) => void;
}) {
  const [refs, setRefs] = useState<LinkedRef[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRefs(null);
    api<{ refs: LinkedRef[] }>(`/chat/channels/${channelId}/refs`)
      .then((res) => {
        if (alive) setRefs(res.refs ?? []);
      })
      .catch(() => {
        if (alive) setRefs([]);
      });
    return () => {
      alive = false;
    };
  }, [channelId]);

  if (!refs) return <p className="chat-panel__empty">Cargando…</p>;
  if (!refs.length) {
    return (
      <p className="chat-panel__empty">
        Aquí queda lo que se arrobe en esta conversación: tareas, eventos, órdenes de compra, formatos y documentos.
      </p>
    );
  }
  return (
    <div className="ref-panel">
      {REF_GROUPS.map((g) => {
        const rows = refs.filter((r) => r.kind === g.kind);
        if (!rows.length) return null;
        return (
          <section key={g.kind}>
            <h4 className="ref-panel__title">{g.title}</h4>
            {rows.map((r) => {
              const key = refKey(r);
              const card = live[key] ? { ...r, ...live[key], label: r.label } : r;
              return (
                <RefCard
                  key={key}
                  r={card}
                  onAction={card.canOpen ? onAction : undefined}
                  busy={busyKey === key}
                  extra={
                    <button type="button" className="ref-card__jump" onClick={() => onJump(r.messageId)}>
                      Ir al mensaje{r.count > 1 ? ` (${r.count})` : ''}
                    </button>
                  }
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
