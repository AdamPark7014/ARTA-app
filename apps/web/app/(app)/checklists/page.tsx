'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
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

export default function ChecklistsTemplatesPage() {
  const { entity, user } = useUser();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [preview, setPreview] = useState<Template | null>(null);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [restoring, setRestoring] = useState(false);

  const canManage =
    !!user &&
    (user.roleKey === 'dir_general' ||
      user.roleKey === 'super_admin' ||
      user.roleKey === 'gerente_arta' ||
      user.roleKey === 'dir_auditorio' ||
      user.permissions.includes('everything') ||
      user.permissions.includes('users.manage'));

  async function load() {
    const list = await api<Template[]>(`/checklists/templates${canManage ? '?all=1' : ''}`);
    setTemplates(
      list.filter((t) => !t.entities.length || t.entities.includes(entity) || canManage),
    );
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, canManage]);

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
      <div className="stack">
        <p className="muted">
          Cada plantilla es un <strong style={{ color: 'var(--text)' }}>formato PDF</strong> que se
          copia al crear un evento. El equipo lo llena en pantalla y el PDF embebido se regenera solo
          (guardar / firmar). Entidad activa:{' '}
          {entity === 'ARTA' ? 'Arta' : 'Auditorio'}.
        </p>
        {msg ? <div className="muted">{msg}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1.35fr' : '1fr', gap: 16 }}>
          <div className="grid-cards">
            {templates.map((t) => {
              const questions = (t.schemaJson?.sections || []).reduce(
                (n, s) => n + (s.items?.length || 0),
                0,
              );
              return (
                <div className="kpi" key={t.id}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className={`badge ${t.active ? 'ok' : 'warn'}`}>
                      {t.active ? 'Activa' : 'Inactiva'}
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      v{t.version}
                    </span>
                  </div>
                  <div style={{ fontWeight: 650, marginTop: 10, fontSize: '1.05rem' }}>{t.name}</div>
                  <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                    {t.description || 'Sin descripción'}
                  </p>
                  <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                    PDF · {entityLabel(t.entities)}
                    {questions ? ` · ${questions} campos` : ''}
                  </div>
                  <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn ghost" type="button" onClick={() => openPreview(t, false)}>
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

          {preview ? (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>{preview.name}</h2>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
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
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {(s.items || []).map((it) => (
                          <li key={it.id} style={{ fontSize: 14, marginBottom: 6 }}>
                            {it.label || 'Sin etiqueta'}
                            <span className="muted" style={{ fontSize: 12 }}>
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
                              <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                                {new Date(v.createdAt).toLocaleString('es-MX')}
                              </td>
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
                    ) : (
                      <p className="muted">Aún no hay historial (aparece al guardar cambios).</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
