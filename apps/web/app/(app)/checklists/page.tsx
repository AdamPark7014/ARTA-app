'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldSearch, FilterBar, FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { TemplateSchemaEditor } from '@/components/checklists/TemplateSchemaEditor';
import type { SchemaSection } from '@/components/checklists/TemplateSchemaEditor';

type TemplateVersion = {
  id: string;
  version: number;
  note?: string | null;
  createdAt: string;
  editedBy?: { fullName: string } | null;
};

type Template = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  entities: string[];
  active: boolean;
  version: number;
  versions?: TemplateVersion[];
  schemaJson?: {
    sections?: Array<{
      id: string;
      title: string;
      items?: Array<{ id: string; label: string; type?: string; options?: string[] }>;
    }>;
  };
};

const TYPE_LABEL: Record<string, string> = {
  check: 'Casilla',
  text: 'Texto',
  number: 'Número',
  date: 'Fecha',
  select: 'Opciones',
};

function entityLabel(entities: string[]) {
  const arta = !entities.length || entities.includes('ARTA');
  const aud = !entities.length || entities.includes('EXPLANADA');
  if (arta && aud) return 'Arta y Auditorio';
  if (aud) return 'Solo Auditorio';
  return 'Solo Arta';
}

function msgVariant(msg: string): 'success' | 'error' | 'warn' | 'info' {
  const m = msg.toLowerCase();
  if (m.includes('error')) return 'error';
  if (m.includes('inactiva')) return 'warn';
  if (m.includes('restaurad') || m.includes('activa')) return 'success';
  return 'info';
}

export default function ChecklistsTemplatesPage() {
  const { entity, user } = useUser();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [preview, setPreview] = useState<Template | null>(null);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const canManage =
    !!user &&
    (user.roleKey === 'dir_general' ||
      user.roleKey === 'super_admin' ||
      user.roleKey === 'gerente_arta' ||
      user.roleKey === 'dir_auditorio' ||
      user.permissions.includes('everything') ||
      user.permissions.includes('users.manage'));

  async function load() {
    setLoading(true);
    try {
      const list = await api<Template[]>(`/checklists/templates${canManage ? '?all=1' : ''}`);
      setTemplates(
        list.filter((t) => !t.entities.length || t.entities.includes(entity) || canManage),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, canManage]);

  const filtered = useMemo(() => {
    if (!q.trim()) return templates;
    const n = q.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(n) ||
        t.key.toLowerCase().includes(n) ||
        (t.description || '').toLowerCase().includes(n),
    );
  }, [templates, q]);

  async function toggleActive(t: Template) {
    if (!canManage) return;
    await api(`/checklists/templates/${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !t.active }),
    });
    setMsg(`${t.name} → ${!t.active ? 'activa' : 'inactiva'}`);
    await load();
    if (preview?.id === t.id) setPreview({ ...t, active: !t.active });
  }

  async function openPreview(t: Template, edit = false) {
    const full = await api<Template>(`/checklists/templates/${t.id}`);
    setPreview(full);
    setEditing(edit && canManage);
  }

  async function restoreVersion(versionId: string) {
    if (!preview || !canManage) return;
    if (!confirm('¿Restaurar esta versión? Se guarda un respaldo de la actual.')) return;
    setRestoring(true);
    setMsg('');
    try {
      const full = await api<Template>(`/checklists/templates/${preview.id}/restore/${versionId}`, {
        method: 'POST',
      });
      setPreview(full);
      setEditing(false);
      setMsg('Versión restaurada (afecta eventos nuevos)');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al restaurar');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <AppShell title="Plantillas">
      <div className="stack page-workspace">
        <PageHeader
          description="Cada plantilla es un formato PDF que se copia al crear un evento. El equipo lo llena en pantalla y el PDF embebido se regenera al guardar o firmar."
          hint={`Entidad activa: ${entity === 'ARTA' ? 'Arta' : 'Auditorio'}. Las versiones nuevas aplican solo a eventos creados después del cambio.`}
        />

        {msg ? (
          <FlashMessage variant={msgVariant(msg)} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        {loading ? (
          <LoadingBlock rows={4} label="Cargando plantillas…" />
        ) : (
          <>
            <FilterBar meta={`${filtered.length} de ${templates.length} plantillas · ${entity}`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar plantilla…"
                label="Buscar plantillas"
              />
            </FilterBar>

            <div className={preview ? 'studio-split' : 'stack'}>
            {!templates.length ? (
              <EmptyState
                title="Sin plantillas visibles"
                description="No hay formatos de checklist para esta entidad. Si eres administrador, revisa permisos o crea plantillas en el catálogo."
              />
            ) : !filtered.length ? (
              <EmptyState title="Sin coincidencias" description="Prueba otro término de búsqueda.">
                <button className="btn ghost" type="button" onClick={() => setQ('')}>
                  Limpiar búsqueda
                </button>
              </EmptyState>
            ) : (
              <div className="grid-cards">
                {filtered.map((t) => {
                  const questions = (t.schemaJson?.sections || []).reduce(
                    (n, s) => n + (s.items?.length || 0),
                    0,
                  );
                  return (
                    <div className="kpi" key={t.id}>
                      <div className="row">
                        <span className={`badge ${t.active ? 'ok' : 'warn'}`}>
                          {t.active ? 'Activa' : 'Inactiva'}
                        </span>
                        <span className="kpi-sub muted">v{t.version}</span>
                      </div>
                      <strong>{t.name}</strong>
                      <p className="kpi-sub muted">{t.description || 'Sin descripción'}</p>
                      <div className="kpi-sub muted">
                        PDF · {entityLabel(t.entities)}
                        {questions ? ` · ${questions} campos` : ''}
                      </div>
                      <div className="row">
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => openPreview(t, false)}
                        >
                          Ver
                        </button>
                        {canManage ? (
                          <>
                            <button className="btn" type="button" onClick={() => openPreview(t, true)}>
                              Editar
                            </button>
                            <button className="btn ghost" type="button" onClick={() => toggleActive(t)}>
                              {t.active ? 'Desactivar' : 'Activar'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {preview ? (
              <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>{preview.name}</h2>
                  <div className="kpi-sub muted">
                    {preview.description || 'Sin descripción'} · {entityLabel(preview.entities)} · v
                    {preview.version}
                  </div>
                </div>
                <div className="row">
                  {canManage && !editing ? (
                    <button className="btn" type="button" onClick={() => setEditing(true)}>
                      Editar
                    </button>
                  ) : null}
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      setPreview(null);
                      setEditing(false);
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
              <div className="panel-body stack">
                {editing && canManage ? (
                  <TemplateSchemaEditor
                    templateId={preview.id}
                    initial={{
                      sections: (preview.schemaJson?.sections || []).map((s) => ({
                        ...s,
                        items: s.items || [],
                      })) as SchemaSection[],
                    }}
                    onSaved={async () => {
                      const full = await api<Template>(`/checklists/templates/${preview.id}`);
                      setPreview(full);
                      await load();
                    }}
                  />
                ) : (
                  (preview.schemaJson?.sections || []).map((s) => (
                    <div key={s.id} className="check-section">
                      <h3>{s.title}</h3>
                      <ul className="check-section__list">
                        {(s.items || []).map((it) => (
                          <li key={it.id}>
                            {it.label || 'Sin etiqueta'}
                            <span className="muted kpi-sub">
                              {' '}
                              · {TYPE_LABEL[it.type || 'check'] || it.type}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}

                {canManage && !editing ? (
                  <div className="check-section">
                    <h3>Versiones anteriores</h3>
                    {(preview.versions || []).length ? (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>v</th>
                              <th>Quién</th>
                              <th>Nota</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {(preview.versions || []).map((v) => (
                              <tr key={v.id}>
                                <td className="muted">{new Date(v.createdAt).toLocaleString('es-MX')}</td>
                                <td>v{v.version}</td>
                                <td>{v.editedBy?.fullName || '—'}</td>
                                <td className="muted">{v.note || '—'}</td>
                                <td>
                                  <button
                                    className="btn ghost"
                                    type="button"
                                    disabled={restoring}
                                    onClick={() => restoreVersion(v.id)}
                                  >
                                    Restaurar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="muted">Aún no hay historial (aparece al guardar cambios).</p>
                    )}
                  </div>
                ) : null}
              </div>
              </div>
            ) : null}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
