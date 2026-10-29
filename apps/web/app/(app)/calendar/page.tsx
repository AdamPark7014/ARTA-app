'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { PageHeader } from '@/components/ui/PageChrome';
import { MonthCalendar, type CalendarItem } from '@/components/ui/MonthCalendar';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { canAccessEventOps } from '@/lib/access-matrix';
import { useUser } from '@/lib/user-context';

type EventRow = {
  id: string;
  name: string;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

type NoteRow = {
  id: string;
  date: string;
  text: string;
  createdBy?: { id: string; fullName: string } | null;
  updatedBy?: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
};

function noteTitle(n: NoteRow): string {
  const who = n.updatedBy?.fullName || n.createdBy?.fullName;
  return who ? `${n.text} · ${who}` : n.text;
}

/**
 * Calendario de shows: el mismo mes que en Campañas, cada show en sus días y
 * un clic para abrirlo. Sin filtros ni panel lateral: los cancelados no salen.
 *
 * Junta 27-09-2026 (Adam): «que el equipo pueda escribir sobre el
 * calendario». Cualquier día se toca y se deja una nota corta — un
 * recordatorio compartido, no una tarea con flujo. Todo el equipo con acceso
 * a la entidad la ve y la puede editar o borrar.
 *
 * Junta 23-10-2026: el practicante (sitio y redes) lo consulta en solo lectura para preparar
 * publicaciones: los shows salen de `/calendar/events`, sin abrir el evento y sin notas nuevas.
 */
export default function EventsCalendarPage() {
  const { entity, user } = useUser();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Sin operación de eventos (practicante): solo lectura, sin entrar al evento ni dejar notas.
  const eventOps = user ? canAccessEventOps(user.roleKey, entity) : false;
  const readOnly = !!user && !eventOps;

  useEffect(() => {
    if (!user || !entity) return;
    setLoading(true);
    Promise.all([
      api<EventRow[]>(readOnly ? `/calendar/events?entity=${entity}` : `/events?entity=${entity}&scope=all`),
      api<NoteRow[]>(`/calendar/notes?entity=${entity}`),
    ])
      .then(([ev, no]) => {
        setEvents(ev);
        setNotes(no);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user, entity, readOnly]);

  useEffect(() => {
    if (openDay) textareaRef.current?.focus();
  }, [openDay, editingId]);

  const items = useMemo<CalendarItem[]>(
    () =>
      events
        .filter((e) => e.startsAt && e.status !== 'CANCELLED')
        .map((e) => ({
          key: e.id,
          label: e.name,
          from: e.startsAt as string,
          to: e.endsAt || e.startsAt,
          tone: 'show' as const,
          href: readOnly ? undefined : `/events/${e.id}`,
        })),
    [events, readOnly],
  );

  const notesByDay = useMemo(() => {
    const map = new Map<string, NoteRow[]>();
    for (const n of notes) {
      const list = map.get(n.date) || [];
      list.push(n);
      map.set(n.date, list);
    }
    return map;
  }, [notes]);

  function closeCompose() {
    setOpenDay(null);
    setEditingId(null);
    setDraft('');
  }

  function openForDay(day: string) {
    setOpenDay(day);
    setEditingId(null);
    setDraft('');
  }

  function openForEdit(note: NoteRow) {
    setOpenDay(note.date);
    setEditingId(note.id);
    setDraft(note.text);
  }

  async function saveDraft() {
    const text = draft.trim();
    if (!text || !openDay) return;
    setSaving(true);
    try {
      if (editingId) {
        const updated = await api<NoteRow>(`/calendar/notes/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ text }),
        });
        setNotes((prev) => prev.map((n) => (n.id === editingId ? updated : n)));
      } else {
        const created = await api<NoteRow>('/calendar/notes', {
          method: 'POST',
          body: JSON.stringify({ entity, date: openDay, text }),
        });
        setNotes((prev) => [...prev, created]);
      }
      closeCompose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(id: string) {
    if (!confirm('¿Quitar esta nota del calendario?')) return;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    closeCompose();
    try {
      await api(`/calendar/notes/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <AppShell title="Calendario">
      <div className="sx-stack page-workspace">
        <PageHeader
          title="Calendario"
          description={
            readOnly
              ? `Shows de ${entity === 'ARTA' ? 'Arta' : 'Auditorio'} · solo consulta, para preparar publicaciones del sitio`
              : `Shows de ${entity === 'ARTA' ? 'Arta' : 'Auditorio'} · toca un día para dejar una nota`
          }
        >
          {readOnly ? null : (
            <Link className="btn-quiet" href="/events">
              Ver lista
            </Link>
          )}
        </PageHeader>
        {loading ? (
          <LoadingBlock rows={6} label="Cargando calendario…" />
        ) : (
          <MonthCalendar
            items={items}
            onDayClick={readOnly ? undefined : (day) => (openDay === day ? closeCompose() : openForDay(day))}
            renderDay={(day) => {
              const dayNotes = notesByDay.get(day) || [];
              if (readOnly) {
                return dayNotes.map((n) => (
                  <span key={n.id} className="mcal__note" title={noteTitle(n)}>
                    <span className="mcal__note-body">
                      <span className="mcal__note-text">{n.text}</span>
                    </span>
                  </span>
                ));
              }
              const isOpen = openDay === day;
              return (
                <>
                  {dayNotes
                    .filter((n) => n.id !== editingId)
                    .map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className="mcal__note"
                        title={noteTitle(n)}
                        onClick={(e) => {
                          e.stopPropagation();
                          openForEdit(n);
                        }}
                      >
                        <span className="mcal__note-body">
                          <span className="mcal__note-text">{n.text}</span>
                          {n.createdBy ? <span className="mcal__note-by">{n.createdBy.fullName.split(' ')[0]}</span> : null}
                        </span>
                      </button>
                    ))}

                  {isOpen ? (
                    <div className="mcal__note-form" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        ref={textareaRef}
                        value={draft}
                        placeholder="Escribe una nota para este día…"
                        maxLength={500}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') closeCompose();
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveDraft();
                        }}
                      />
                      <div className="row">
                        <button className="btn btn-sm" type="button" disabled={saving || !draft.trim()} onClick={() => void saveDraft()}>
                          {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button className="btn ghost btn-sm" type="button" onClick={closeCompose}>
                          Cancelar
                        </button>
                        {editingId ? (
                          <button className="btn ghost btn-sm btn-danger" type="button" onClick={() => void removeNote(editingId)}>
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="mcal__add-note"
                      onClick={(e) => {
                        e.stopPropagation();
                        openForDay(day);
                      }}
                    >
                      + nota
                    </button>
                  )}
                </>
              );
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
