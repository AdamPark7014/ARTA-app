'use client';

import { askConfirm } from '@/components/ui/AskDialog';
import { FileViewer, PdfEditor, SheetEditor } from '@/components/files/lazy';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, FileRow, Pill } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldCheck, FieldSearch, FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { replaceFolderFile } from '@/lib/file-save';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';
import { ALL_ROLES, isDirectionRole, roleLabel } from '@arta/rbac';

/**
 * Roles con los que se puede compartir una carpeta. Dirección y la administración de la
 * plataforma ven todas las carpetas, así que no se ofrecen como opción.
 */
const SHARE_ROLES: string[] = ALL_ROLES.filter((r) => !isDirectionRole(r));

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
/** `useSearchParams` (el aviso que lleva a un día o a una carpeta) pide Suspense en el build. */
export default function FoldersPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Carpetas">
          <LoadingBlock rows={6} label="Cargando carpetas…" />
        </AppShell>
      }
    >
      <FoldersPageInner />
    </Suspense>
  );
}

function FoldersPageInner() {
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
  /**
   * Edición de la carpeta abierta: nombre, descripción y con qué roles se comparte.
   * `extraRoles`: los que ya traía la carpeta y no salen como casilla (dirección, roles retirados); se conservan al guardar.
   */
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    allowedRoles: [] as string[],
    extraRoles: [] as string[],
  });
  const [savingFolder, setSavingFolder] = useState(false);

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

  // El aviso de una carpeta (`?folder=`) la abre directo.
  const focusFolder = useSearchParams()?.get('folder') ?? null;
  useEffect(() => {
    if (focusFolder) openFolder(focusFolder).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFolder, entity]);

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
      setEditing(false);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo abrir la carpeta', variant: 'error' });
    }
  }

  function startEdit(folder: FolderDetail) {
    const current = folder.allowedRoles || [];
    setEditForm({
      name: folder.name,
      description: folder.description || '',
      allowedRoles: current.filter((r) => SHARE_ROLES.includes(r)),
      extraRoles: current.filter((r) => !SHARE_ROLES.includes(r)),
    });
    setEditing(true);
  }

  function toggleShareRole(role: string, on: boolean) {
    setEditForm((f) => ({
      ...f,
      allowedRoles: on ? [...f.allowedRoles.filter((r) => r !== role), role] : f.allowedRoles.filter((r) => r !== role),
    }));
  }

  /** `PATCH /folders/:id`: el servidor avisa a quien gana acceso con el cambio de roles. */
  async function saveFolder(e: FormEvent) {
    e.preventDefault();
    if (!active || !editForm.name.trim()) return;
    setSavingFolder(true);
    try {
      await api(`/folders/${active.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          // Casillas + lo que ya traía y no se ofrece como casilla: no se pierde ningún rol al guardar.
          allowedRoles: Array.from(new Set([...editForm.extraRoles, ...editForm.allowedRoles])),
        }),
      });
      setMsg({ text: 'Carpeta actualizada', variant: 'success' });
      await openFolder(active.id);
      await load();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo guardar la carpeta', variant: 'error' });
    } finally {
      setSavingFolder(false);
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
      // El 403 del servidor llega como «Forbidden»: aquí se dice qué pasó.
      const text =
        e instanceof ApiError && e.status === 403
          ? 'No tienes permiso para subir archivos aquí'
          : e instanceof Error
            ? e.message
            : 'No se pudo subir el archivo';
      setMsg({ text, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(fileId: string, fileName: string) {
    if (!active || !(await askConfirm({ title: `¿Quitar «${fileName}» de la carpeta?`, confirmLabel: 'Quitar', danger: true }))) return;
    await api(`/folders/${active.id}/files/${fileId}`, { method: 'DELETE' });
    await openFolder(active.id);
  }

  async function removeFolder(folder: Folder) {
    if (!(await askConfirm({ title: `¿Eliminar la carpeta «${folder.name}»?`, body: 'Se borran también sus archivos.', danger: true }))) return;
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
          <PageHeader
            title={active.name}
            description={active.description || `${active.files.length} ${active.files.length === 1 ? 'archivo' : 'archivos'}`}
            below={
              active.allowedRoles?.length ? (
                <div className="folder-shared" role="group" aria-label="Compartida con">
                  <span className="t-muted t-small">Compartida con</span>
                  {active.allowedRoles.map((r) => (
                    <Pill key={r} tone="quiet">
                      {roleLabel(r)}
                    </Pill>
                  ))}
                </div>
              ) : null
            }
          >
            {canEdit ? (
              <>
                <button className="btn-quiet" type="button" onClick={() => removeFolder(active)}>
                  Eliminar carpeta
                </button>
                <button
                  className="btn-quiet"
                  type="button"
                  aria-expanded={editing}
                  onClick={() => (editing ? setEditing(false) : startEdit(active))}
                >
                  {editing ? 'Cerrar edición' : 'Editar'}
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
          </PageHeader>

          {flash}

          {editing && canEdit ? (
            <form className="surface surface--pad fx" onSubmit={saveFolder} aria-label="Editar carpeta">
              <div className="fx-grid">
                <label>
                  Nombre
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  Descripción <span className="fx-hint">(opcional)</span>
                  <input
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
              </div>
              <div className="fx-field">
                <span>Compartir con</span>
                <p className="t-muted t-small">
                  Sin roles marcados la ve todo el equipo de la entidad, menos practicantes. Dirección la ve siempre. A quien
                  gane acceso le llega un aviso.
                </p>
                <div className="folder-share-roles" role="group" aria-label="Compartir con">
                  {SHARE_ROLES.map((role) => (
                    <FieldCheck
                      key={role}
                      checked={editForm.allowedRoles.includes(role)}
                      onChange={(on) => toggleShareRole(role, on)}
                      label={roleLabel(role)}
                    />
                  ))}
                </div>
              </div>
              <div className="fx-actions">
                <button className="btn ghost btn-sm" type="button" onClick={() => setEditing(false)} disabled={savingFolder}>
                  Cancelar
                </button>
                <button className="btn btn-sm" type="submit" disabled={savingFolder || !editForm.name.trim()}>
                  {savingFolder ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          ) : null}

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
                      <button
                        className="btn-quiet"
                        type="button"
                        onClick={() => {
                          setEditFileId(null);
                          setOpenFileId(file.id);
                        }}
                      >
                        Abrir
                      </button>
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
                        <FileViewer url={`/api/folders/files/${file.id}/inline`} fileName={file.fileName} />
                      </div>
                    ) : null}
                    {editing ? (
                      <div className="surface finance-viewer">
                        {isSheet(file.fileName) ? (
                          <SheetEditor
                            key={file.id}
                            url={`/api/folders/files/${file.id}/inline`}
                            fileName={file.fileName}
                            canEdit={canEdit}
                            onSave={replaceFolderFile(file.id)}
                            onSaved={() => openFolder(active.id)}
                          />
                        ) : (
                          <PdfEditor
                            key={file.id}
                            url={`/api/folders/files/${file.id}/inline`}
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
        <PageHeader title="Carpetas" description={`Documentos generales · ${entity === 'ARTA' ? 'Arta' : 'Auditorio'}`}>
          {folders.length > 6 ? (
            <FieldSearch value={q} onChange={setQ} placeholder="Buscar carpeta…" label="Buscar carpeta" maxWidth={220} />
          ) : null}
          {canEdit && !creating ? (
            <button className="btn btn-sm" type="button" onClick={() => setCreating(true)}>
              + Carpeta
            </button>
          ) : null}
        </PageHeader>

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
