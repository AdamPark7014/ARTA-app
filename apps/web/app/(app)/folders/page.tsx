'use client';

import { FileViewer, PdfEditor, SheetEditor } from '@/components/files/lazy';
import { Fragment, FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { replaceFolderFile } from '@/lib/file-save';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import {
  FieldSearch,
  FlashMessage,
  FormGrid,
  PageHeader,
  FilterBar,
} from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';

function isSheet(name: string) {
  return /\.(xlsx?|csv)$/i.test(name);
}

function isPdf(name: string) {
  return /\.pdf$/i.test(name);
}

function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

type Folder = {
  id: string;
  name: string;
  description?: string | null;
  allowedRoles: string[];
  entity: string;
  _count?: { files: number };
};

type FolderDetail = Folder & {
  files: Array<{ id: string; fileName: string; url: string; createdAt: string }>;
};

function flashVariant(msg: string): 'info' | 'success' | 'error' {
  if (/error/i.test(msg)) return 'error';
  if (/cread|agregad/i.test(msg)) return 'success';
  return 'info';
}

export default function FoldersPage() {
  const { entity, user } = useUser();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [active, setActive] = useState<FolderDetail | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [editFileId, setEditFileId] = useState<string | null>(null);

  const canEdit = user
    ? userHasPermission(user.roleKey, user.permissions, ['folders.edit', 'everything'])
    : false;

  async function load() {
    setLoading(true);
    try {
      const list = await api<Folder[]>(`/folders?entity=${entity}`);
      setFolders(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
    setActive(null);
  }, [entity]);

  const filtered = useMemo(() => {
    if (!q.trim()) return folders;
    const n = q.toLowerCase();
    return folders.filter(
      (f) =>
        f.name.toLowerCase().includes(n) ||
        (f.description || '').toLowerCase().includes(n),
    );
  }, [folders, q]);

  async function openFolder(id: string) {
    const detail = await api<FolderDetail>(`/folders/${id}`);
    setActive(detail);
  }

  async function createFolder(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api('/folders', {
      method: 'POST',
      body: JSON.stringify({ entity, name, description: description || undefined, allowedRoles: [] }),
    });
    setName('');
    setDescription('');
    setMsg('Carpeta creada');
    await load();
  }

  async function uploadToFolder(file: File) {
    if (!active) return;
    const fd = new FormData();
    fd.append('file', file);
    const uploaded = await api<{ url: string; fileName: string; mimeType?: string; sizeBytes?: number }>(
      '/uploads',
      { method: 'POST', body: fd },
    );
    await api(`/folders/${active.id}/files`, {
      method: 'POST',
      body: JSON.stringify({
        fileName: uploaded.fileName || file.name,
        url: uploaded.url,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
      }),
    });
    await openFolder(active.id);
    setMsg('Archivo agregado a la carpeta');
  }

  async function removeFile(fileId: string) {
    if (!active) return;
    await api(`/folders/${active.id}/files/${fileId}`, { method: 'DELETE' });
    await openFolder(active.id);
  }

  async function removeFolder(id: string) {
    if (!confirm('¿Eliminar carpeta y sus archivos?')) return;
    await api(`/folders/${id}`, { method: 'DELETE' });
    if (active?.id === id) setActive(null);
    await load();
  }

  return (
    <AppShell title="Carpetas generales">
      <div className="stack page-workspace">
        <PageHeader
          description={`Documentos compartidos por entidad (no ligados a un evento). Acceso según roles en ${entity}.`}
          hint="Útil para políticas, formatos base y archivos de referencia. Los archivos de un evento viven en la ficha del evento."
        />

        {msg ? (
          <FlashMessage variant={flashVariant(msg)} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        <div className={active ? 'studio-split' : 'stack'}>
          <div className="stack">
            {canEdit ? (
              <div className="panel">
                <div className="panel-head">
                  <h2>Nueva carpeta · {entity}</h2>
                </div>
                <div className="panel-body">
                  <form className="form" onSubmit={createFolder}>
                    <FormGrid cols={2}>
                      <label>
                        Nombre
                        <input value={name} onChange={(e) => setName(e.target.value)} required />
                      </label>
                      <label>
                        Descripción
                        <input value={description} onChange={(e) => setDescription(e.target.value)} />
                      </label>
                    </FormGrid>
                    <button className="btn" type="submit">
                      Crear
                    </button>
                  </form>
                </div>
              </div>
            ) : null}

            <div className="panel">
              <div className="panel-head">
                <h2>Carpetas</h2>
              </div>
              <div className="panel-body">
                <FilterBar meta={`${filtered.length} de ${folders.length} carpetas · ${entity}`}>
                  <FieldSearch
                    value={q}
                    onChange={setQ}
                    placeholder="Buscar carpeta…"
                    label="Buscar carpetas"
                  />
                </FilterBar>

                {loading ? (
                  <LoadingBlock rows={3} label="Cargando carpetas…" />
                ) : !folders.length ? (
                  <EmptyState
                    title={`Sin carpetas en ${entity}`}
                    description="Crea una carpeta para compartir documentos de la entidad con el equipo."
                  />
                ) : !filtered.length ? (
                  <EmptyState title="Sin coincidencias" description="Prueba otro término de búsqueda.">
                    <button className="btn ghost" type="button" onClick={() => setQ('')}>
                      Limpiar búsqueda
                    </button>
                  </EmptyState>
                ) : (
                  <div className="table-wrap">
                    <table className="table table-sticky">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Archivos</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((f) => (
                          <tr key={f.id}>
                            <td>
                              <button className="btn ghost" type="button" onClick={() => openFolder(f.id)}>
                                {f.name}
                              </button>
                              <div className="kpi-sub muted">{f.description || '—'}</div>
                            </td>
                            <td>{f._count?.files ?? 0}</td>
                            <td>
                              {canEdit ? (
                                <button className="btn ghost" type="button" onClick={() => removeFolder(f.id)}>
                                  Eliminar
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {active ? (
            <div className="panel">
              <div className="panel-head">
                <h2>{active.name}</h2>
                <button className="btn ghost" type="button" onClick={() => setActive(null)}>
                  Cerrar
                </button>
              </div>
              <div className="panel-body stack">
                {canEdit ? (
                  <label className="btn module-upload">
                    Subir archivo
                    <input
                      type="file"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadToFolder(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
                {!active.files.length ? (
                  <EmptyState title="Carpeta vacía" description="Sube el primer archivo a esta carpeta." />
                ) : (
                  <div className="table-wrap">
                    <table className="table table-sticky">
                      <thead>
                        <tr>
                          <th>Archivo</th>
                          <th>Fecha</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {active.files.map((file) => {
                          const viewing = openFileId === file.id;
                          const editing = editFileId === file.id;
                          const embeddable =
                            isSheet(file.fileName) || isPdf(file.fileName) || isImage(file.fileName);
                          const editable = isSheet(file.fileName) || isPdf(file.fileName);
                          return (
                            <Fragment key={file.id}>
                              <tr>
                                <td>{file.fileName}</td>
                                <td className="kpi-sub muted">
                                  {new Date(file.createdAt).toLocaleString('es-MX')}
                                </td>
                                <td className="row">
                                  {embeddable ? (
                                    <button
                                      className={viewing ? 'btn btn-sm' : 'btn ghost btn-sm'}
                                      type="button"
                                      onClick={() => {
                                        setEditFileId(null);
                                        setOpenFileId(viewing ? null : file.id);
                                      }}
                                    >
                                      {viewing ? 'Ocultar' : 'Ver aquí'}
                                    </button>
                                  ) : null}
                                  {editable && canEdit ? (
                                    <button
                                      className={editing ? 'btn btn-sm' : 'btn ghost btn-sm'}
                                      type="button"
                                      onClick={() => {
                                        setOpenFileId(null);
                                        setEditFileId(editing ? null : file.id);
                                      }}
                                    >
                                      {editing
                                        ? 'Cerrar editor'
                                        : isSheet(file.fileName)
                                          ? 'Editar aquí'
                                          : 'Escribir encima'}
                                    </button>
                                  ) : null}
                                  <a
                                    className="btn ghost btn-sm"
                                    href={file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Abrir
                                  </a>
                                  {canEdit ? (
                                    <button
                                      className="btn ghost btn-sm"
                                      type="button"
                                      onClick={() => removeFile(file.id)}
                                    >
                                      Quitar
                                    </button>
                                  ) : null}
                                </td>
                              </tr>

                              {viewing ? (
                                <tr className="campaign-expand">
                                  <td colSpan={3}>
                                    <FileViewer url={file.url} fileName={file.fileName} />
                                  </td>
                                </tr>
                              ) : null}

                              {editing ? (
                                <tr className="campaign-expand">
                                  <td colSpan={3}>
                                    {isSheet(file.fileName) ? (
                                      <SheetEditor
                                        key={file.id}
                                        url={file.url}
                                        fileName={file.fileName}
                                        canEdit={canEdit}
                                        onSave={replaceFolderFile(file.id)}
                                        onSaved={load}
                                      />
                                    ) : (
                                      <PdfEditor
                                        key={file.id}
                                        url={file.url}
                                        fileName={file.fileName}
                                        canEdit={canEdit}
                                        onSave={replaceFolderFile(file.id)}
                                        onSaved={load}
                                      />
                                    )}
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
