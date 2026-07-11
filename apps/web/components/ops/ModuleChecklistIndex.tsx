'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type Checklist = {
  id: string;
  title: string;
  progressPct: number;
  template?: { key: string };
  dataJson?: {
    sections?: Array<{
      id: string;
      items: Array<{ id: string; label: string; value?: string | number | null; done?: boolean }>;
    }>;
  };
};

type EventRow = {
  id: string;
  name: string;
  status: string;
  entity: string;
  artist?: string | null;
  checklists: Checklist[];
};

type FieldSpec = { id: string; label: string; sectionId?: string };

type Props = {
  title: string;
  description: string;
  templateKeys: string[];
  titleMatch?: RegExp;
  fields?: FieldSpec[];
};

function pickValue(c: Checklist, field: FieldSpec) {
  for (const s of c.dataJson?.sections || []) {
    if (field.sectionId && s.id !== field.sectionId) continue;
    const it = s.items.find((i) => i.id === field.id);
    if (it) return it.value ?? (it.done ? 'Sí' : '—');
  }
  return '—';
}

export function ModuleChecklistIndex({ title, description, templateKeys, titleMatch, fields = [] }: Props) {
  const { entity } = useUser();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    api<EventRow[]>(`/events?entity=${entity}`)
      .then(async (list) => {
        const detailed = await Promise.all(list.slice(0, 40).map((e) => api<EventRow>(`/events/${e.id}`)));
        setEvents(detailed);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entity]);

  const rows = useMemo(() => {
    const out: Array<{ event: EventRow; checklist: Checklist }> = [];
    for (const ev of events) {
      for (const c of ev.checklists || []) {
        const keyOk = c.template?.key && templateKeys.includes(c.template.key);
        const titleOk = titleMatch ? titleMatch.test(c.title) : false;
        if (keyOk || titleOk) out.push({ event: ev, checklist: c });
      }
    }
    if (!q.trim()) return out;
    const needle = q.toLowerCase();
    return out.filter(
      (r) =>
        r.event.name.toLowerCase().includes(needle) ||
        (r.event.artist || '').toLowerCase().includes(needle) ||
        r.checklist.title.toLowerCase().includes(needle),
    );
  }, [events, q, templateKeys, titleMatch]);

  const entityName = entity === 'ARTA' ? 'Arta' : 'Auditorio';

  return (
    <AppShell title={title}>
      <div className="page-workspace stack">
        <div className="page-intro">
          <div>
            <p className="muted">{description}</p>
            <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Los registros de esta página <strong style={{ color: 'var(--text)' }}>no se crean aquí</strong>.
              Salen de los <strong style={{ color: 'var(--text)' }}>eventos</strong> de {entityName}: al crear un
              evento se copian las plantillas (PDF) y aquí ves el índice de ese formato.
            </p>
          </div>
          <div className="row">
            <Link className="btn ghost" href="/events">
              Ver eventos
            </Link>
            <Link className="btn" href="/events/new">
              Nuevo evento
            </Link>
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <input
            className="field"
            style={{ maxWidth: 360 }}
            placeholder={`Buscar en ${title.toLowerCase()}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="muted" style={{ fontSize: 13 }}>
            {loading ? 'Cargando…' : `${rows.length} registro${rows.length === 1 ? '' : 's'} · ${entityName}`}
          </span>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>
              {title} · {entityName}
            </h2>
          </div>
          <div className="panel-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Evento</th>
                    {fields.map((f) => (
                      <th key={f.id}>{f.label}</th>
                    ))}
                    <th>Avance</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ event, checklist }) => (
                    <tr key={checklist.id}>
                      <td>
                        <strong>{event.name}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {event.artist || '—'} · {event.status}
                        </div>
                      </td>
                      {fields.map((f) => (
                        <td key={f.id}>{String(pickValue(checklist, f))}</td>
                      ))}
                      <td>
                        <div className="progress" style={{ minWidth: 80 }}>
                          <span style={{ width: `${checklist.progressPct}%` }} />
                        </div>
                        <span className="muted" style={{ fontSize: 11 }}>
                          {checklist.progressPct}%
                        </span>
                      </td>
                      <td>
                        <Link
                          className="btn ghost"
                          href={`/events/${event.id}?tab=checklists&checklist=${checklist.id}`}
                        >
                          Abrir PDF / checklist
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && !rows.length ? (
                    <tr>
                      <td colSpan={3 + fields.length}>
                        <div className="empty-state">
                          <h3>Aún no hay {title.toLowerCase()}</h3>
                          <p className="muted" style={{ margin: 0 }}>
                            Esta vista lista los checklists de tipo{' '}
                            <code>{templateKeys.join(', ')}</code> que ya existen dentro de eventos de{' '}
                            {entityName}.
                          </p>
                          <ol>
                            <li>
                              Crea un evento en <strong>Nuevo evento</strong> (o abre uno existente).
                            </li>
                            <li>
                              Al crearlo, el sistema instancia las plantillas activas (incluye este
                              formato + PDF).
                            </li>
                            <li>
                              Vuelve aquí: verás una fila por evento. Con <strong>Abrir</strong> editas y
                              regeneras el PDF embebido.
                            </li>
                          </ol>
                          <div className="row">
                            <Link className="btn" href="/events/new">
                              Crear evento
                            </Link>
                            <Link className="btn ghost" href="/checklists">
                              Ver plantillas
                            </Link>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
