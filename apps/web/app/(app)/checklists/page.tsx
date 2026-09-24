'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldSearch, FilterBar, FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useStickyState } from '@/lib/use-sticky-state';
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
  excelTemplateUrl?: string | null;
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
  longtext: 'Texto largo',
  number: 'Número',
  date: 'Fecha',
  time: 'Hora',
  yesno: 'Sí / No',
  select: 'Opciones',
  table: 'Tabla',
  attachment: 'Adjunto',
  signature: 'Firma',
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
  const [scope, setScope] = useStickyState<'all' | 'active' | 'inactive'>('templates.scope', 'all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const canManage =
    !!user &&
    (user.roleKey === 'dir_general' ||
      user.roleKey === 'dir_adjunta' ||
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
    let list = templates;
    if (scope === 'active') list = list.filter((t) => t.active);
    if (scope === 'inactive') list = list.filter((t) => !t.active);
    if (!q.trim()) return list;
    const n = q.toLowerCase();
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(n) ||
        t.key.toLowerCase().includes(n) ||
        (t.description || '').toLowerCase().includes(n),
    );
  }, [templates, q, scope]);

  async function createBlank() {
    if (!canManage) return;
    setBusy('new');
    setMsg('');
    setError('');
    try {
      const created = await api<Template>('/checklists/templates', {
        method: 'POST',
        body: JSON.stringify({ name: 'Formato sin título', schemaJson: { sections: [] } }),
      });
      await load();
      await openPreview(created, true);
      setMsg('Formato creado — edítalo y actívalo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el formato');
    } finally {
      setBusy('');
    }
  }

  async function importDocx(file: File) {
    if (!canManage) return;
    setBusy('docx');
    setMsg('');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const created = await api<Template>('/checklists/templates/import-docx', { method: 'POST', body: fd });
      await load();
      await openPreview(created, true);
      setMsg('Plantilla importada desde Word — revisa y ajusta lo necesario');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el Word');
    } finally {
      setBusy('');
    }
  }

  async function importXlsx(file: File) {
    if (!canManage) return;
    setBusy('xlsx');
    setMsg('');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const created = await api<Template>('/checklists/templates/import-xlsx', { method: 'POST', body: fd });
      await load();
      await openPreview(created, false);
      setMsg('Plantilla Excel importada — se copiará a cada evento nuevo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el Excel');
    } finally {
      setBusy('');
    }
  }

  async function replaceExcel(file: File) {
    if (!canManage || !preview) return;
    setBusy('xlsx');
    setMsg('');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await api<Template>(`/checklists/templates/${preview.id}/excel`, { method: 'POST', body: fd });
      setPreview(updated);
      setMsg('Plantilla Excel reemplazada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reemplazar el Excel');
    } finally {
      setBusy('');
    }
  }

  async function toggleActive(t: Template) {
    if (!canManage) return;
    const next = !t.active;
    const snapshot = templates;
    // Optimista: activar una plantilla no justifica recargar el catálogo.
    setTemplates((list) => list.map((x) => (x.id === t.id ? { ...x, active: next } : x)));
    if (preview?.id === t.id) setPreview({ ...preview, active: next });
    try {
      await api(`/checklists/templates/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: next }),
      });
      setMsg(`${t.name} → ${next ? 'activa' : 'inactiva'}`);
    } catch (e) {
      setTemplates(snapshot);
      if (preview?.id === t.id) setPreview({ ...preview, active: t.active });
      setMsg(e instanceof Error ? e.message : 'Error al cambiar la plantilla');
    }
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
        {error ? (
          <FlashMessage variant="error" onDismiss={() => setError('')}>
            {error}
          </FlashMessage>
        ) : null}

        {loading ? (
          <LoadingBlock rows={4} label="Cargando plantillas…" />
        ) : (
          <>
            {canManage ? (
              <div className="row" role="group" aria-label="Nuevo formato">
                <button className="btn" type="button" disabled={busy === 'new'} onClick={createBlank}>
                  {busy === 'new' ? 'Creando…' : 'Nuevo formato'}
                </button>
                <label className="btn-quiet hub-upload">
                  Importar Word
                  <input
                    type="file"
                    hidden
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void importDocx(f);
                    }}
                  />
                </label>
                <label className="btn-quiet hub-upload">
                  Importar Excel
                  <input
                    type="file"
                    hidden
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void importXlsx(f);
                    }}
                  />
                </label>
              </div>
            ) : null}
            <FilterBar meta={`${filtered.length} de ${templates.length} plantillas · ${entity}`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar plantilla…"
                label="Buscar plantillas"
              />
              <div className="chip-row" role="group" aria-label="Filtrar plantillas">
                {(
                  [
                    { key: 'all', label: 'Todas' },
                    { key: 'active', label: 'Activas' },
                    { key: 'inactive', label: 'Inactivas' },
                  ] as Array<{ key: 'all' | 'active' | 'inactive'; label: string }>
                ).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`chip ${scope === s.key ? 'is-on' : ''}`}
                    aria-pressed={scope === s.key}
                    onClick={() => setScope(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
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
                    {canManage && !editing && !preview.excelTemplateUrl ? (
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
                {preview.excelTemplateUrl ? (
                  <div className="stack">
                    <p className="muted">
                      Formato Excel. Se copia a cada evento como hoja editable en el panel (Salir en PDF). No tiene editor de campos.
                    </p>
                    <div className="row">
                      <a className="btn-quiet" href={preview.excelTemplateUrl} target="_blank" rel="noreferrer">
                        Descargar plantilla
                      </a>
                      {canManage ? (
                        <label className="btn">
                          Reemplazar .xlsx
                          <input
                            type="file"
                            hidden
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) void replaceExcel(f);
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                  </div>
                ) : editing && canManage ? (
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
