'use client';

import { FileViewer, PdfEditor, SheetEditor } from '@/components/files/lazy';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, FileRow, SectionHead } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldSearch, FlashMessage } from '@/components/ui/PageChrome';
import { replaceFolderFile } from '@/lib/file-save';
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

/**
 * Carpetas generales: tarjetas de carpeta y, al abrir una, sus archivos.
 *
 * Antes el alta de carpeta estaba siempre desplegada arriba y la carpeta
 * abierta se partía la pantalla con la lista; era la herramienta diaria de
 * Williams y Juan Pablo y se veía como un formulario de administración.
 */
export default function FoldersPage() {
  const { entity, user } = useUser();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [active, setActive] = useState<FolderDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [msg, setMsg] = useState<{ text: string; variant: 'success' | 'error' } | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [editFileId, setEditFileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = user
    ? userHasPermission(user.roleKey, user.permissions, ['folders.edit', 'everything'])
    : false;

  async function load() {
    setLoading(true);
    try {
      setFolders(await api<Folder[]>(`/folders?entity=${entity}`));
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudieron cargar las carpetas', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
    setActive(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return folders;
    return folders.filter(
      (f) => f.name.toLowerCase().includes(n) || (f.description || '').toLowerCase().includes(n),
    );
  }, [folders, q]);

  async function openFolder(id: string) {
    try {
      setActive(await api<FolderDetail>(`/folders/${id}`));
      setOpenFileId(null);
      setEditFileId(null);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo abrir la carpeta', variant: 'error' });
    }
  }

  async function createFolder(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api('/folders', {
        method: 'POST',
        body: JSON.stringify({ entity, name: name.trim(), description: description.trim() || undefined, allowedRoles: [] }),
      });
      setName('');
      setDescription('');
      setCreating(false);
      setMsg({ text: 'Carpeta creada', variant: 'success' });
      await load();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo crear la carpeta', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function uploadToFolder(file: File) {
    if (!active) return;
    setBusy(true);
    try {
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
      setMsg({ text: `${file.name} agregado`, variant: 'success' });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo subir el archivo', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(fileId: string, fileName: string) {
    if (!active || !confirm(`¿Quitar «${fileName}» de la carpeta?`)) return;
    await api(`/folders/${active.id}/files/${fileId}`, { method: 'DELETE' });
    await openFolder(active.id);
  }

  async function removeFolder(folder: Folder) {
    if (!confirm(`¿Eliminar la carpeta «${folder.name}» y sus archivos?`)) return;
    await api(`/folders/${folder.id}`, { method: 'DELETE' });
    setActive(null);
    await load();
  }

  const flash = msg ? (
    <FlashMessage variant={msg.variant} onDismiss={() => setMsg(null)}>
      {msg.text}
    </FlashMessage>
  ) : null;

  if (active) {
    return (
      <AppShell title={active.name}>
        <div className="sx-stack page-workspace">
          <button className="btn-quiet back-link" type="button" onClick={() => setActive(null)}>
            ← Carpetas
          </button>
          <SectionHead
            title={active.name}
            sub={active.description || `${active.files.length} ${active.files.length === 1 ? 'archivo' : 'archivos'}`}
          >
            {canEdit ? (
              <>
                <button className="btn-quiet" type="button" onClick={() => removeFolder(active)}>
                  Eliminar carpeta
                </button>
                <label className="btn btn-sm module-upload" aria-disabled={busy}>
                  {busy ? 'Subiendo…' : 'Subir archivo'}
                  <input
                    type="file"
                    hidden
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void uploadToFolder(f);
                    }}
                  />
                </label>
              </>
            ) : null}
          </SectionHead>

          {flash}

          {!active.files.length ? (
            <div className="surface">
              <EmptyLite icon="▤" title="Carpeta vacía" text={canEdit ? 'Sube el primer archivo.' : undefined} />
            </div>
          ) : (
            <div className="sx-stack">
              {active.files.map((file) => {
                const viewing = openFileId === file.id;
                const editing = editFileId === file.id;
                const embeddable = isSheet(file.fileName) || isPdf(file.fileName) || isImage(file.fileName);
                const editable = canEdit && (isSheet(file.fileName) || isPdf(file.fileName));
                return (
                  <div key={file.id} className="sx-stack folder-file">
                    <FileRow
                      kind={isSheet(file.fileName) ? 'xlsx' : isPdf(file.fileName) ? 'pdf' : 'file'}
                      name={file.fileName}
                      meta={new Date(file.createdAt).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    >
                      {embeddable ? (
                        <button
                          className="btn-quiet"
                          type="button"
                          onClick={() => {
                            setEditFileId(null);
                            setOpenFileId(viewing ? null : file.id);
                          }}
                        >
                          {viewing ? 'Ocultar' : 'Ver'}
                        </button>
                      ) : null}
                      {editable ? (
                        <button
                          className="btn-quiet"
                          type="button"
                          onClick={() => {
                            setOpenFileId(null);
                            setEditFileId(editing ? null : file.id);
                          }}
                        >
                          {editing ? 'Cerrar' : 'Editar'}
                        </button>
                      ) : null}
                      <a className="btn-quiet" href={file.url} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                      {canEdit ? (
                        <button
                          className="icon-btn icon-btn--danger"
                          type="button"
                          aria-label={`Quitar ${file.fileName}`}
                          onClick={() => removeFile(file.id, file.fileName)}
                        >
                          ×
                        </button>
                      ) : null}
                    </FileRow>
                    {viewing ? (
                      <div className="surface finance-viewer">
                        <FileViewer url={file.url} fileName={file.fileName} />
                      </div>
                    ) : null}
                    {editing ? (
                      <div className="surface finance-viewer">
                        {isSheet(file.fileName) ? (
                          <SheetEditor
                            key={file.id}
                            url={file.url}
                            fileName={file.fileName}
                            canEdit={canEdit}
                            onSave={replaceFolderFile(file.id)}
                            onSaved={() => openFolder(active.id)}
                          />
                        ) : (
                          <PdfEditor
                            key={file.id}
                            url={file.url}
                            fileName={file.fileName}
                            canEdit={canEdit}
                            onSave={replaceFolderFile(file.id)}
                            onSaved={() => openFolder(active.id)}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Carpetas">
      <div className="sx-stack page-workspace">
        <SectionHead title="Carpetas" sub={`Documentos generales · ${entity === 'ARTA' ? 'Arta' : 'Auditorio'}`}>
          {folders.length > 6 ? (
            <FieldSearch value={q} onChange={setQ} placeholder="Buscar carpeta…" label="Buscar carpeta" maxWidth={220} />
          ) : null}
          {canEdit && !creating ? (
            <button className="btn btn-sm" type="button" onClick={() => setCreating(true)}>
              + Carpeta
            </button>
          ) : null}
        </SectionHead>

        {flash}

        {creating ? (
          <form className="surface surface--pad fx" onSubmit={createFolder}>
            <div className="fx-grid">
              <label>
                Nombre
                <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </label>
              <label>
                Descripción <span className="fx-hint">(opcional)</span>
                <input value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </div>
            <div className="fx-actions">
              <button className="btn ghost btn-sm" type="button" onClick={() => setCreating(false)}>
                Cancelar
              </button>
              <button className="btn btn-sm" type="submit" disabled={busy || !name.trim()}>
                Crear carpeta
              </button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <LoadingBlock rows={3} label="Cargando carpetas…" />
        ) : !filtered.length ? (
          <div className="surface">
            <EmptyLite icon="▤" title={folders.length ? 'Nada con esa búsqueda' : 'Sin carpetas todavía'} />
          </div>
        ) : (
          <div className="folder-grid">
            {filtered.map((f) => (
              <button key={f.id} type="button" className="folder-card" onClick={() => openFolder(f.id)}>
                <span className="folder-card__icon" aria-hidden>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="folder-card__name">{f.name}</span>
                {f.description ? <span className="folder-card__desc">{f.description}</span> : null}
                <span className="folder-card__count">
                  {f._count?.files ?? 0} {(f._count?.files ?? 0) === 1 ? 'archivo' : 'archivos'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
