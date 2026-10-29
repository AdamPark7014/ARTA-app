'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  attachmentFiles,
  gallerySummary,
  mediaKind,
  type ChecklistAttachmentFile,
  type ChecklistItem,
  type EventFile,
  type MediaKind,
} from '@/components/events/event-detail.types';

/**
 * Galería de fotos y videos de un formato (adjunto con `multiple`).
 *
 * Junta con el cliente (23-10-2026): «subir fotos y videos de recorridos de
 * seguridad durante y post evento». Desde el teléfono se toman o eligen varias
 * a la vez; cada una se sube como adjunto del formato y queda en el campo con
 * su miniatura. Las fotos grandes se reducen a 2560 px antes de subir (lo que
 * hace WhatsApp): pesan una décima parte y el PDF las puede imprimir.
 *
 * Topes (los mismos del API, `upload-storage.ts`): video 250 MB, lo demás 40 MB.
 */

const MB = 1024 * 1024;
export const GALLERY_MAX_VIDEO_MB = 250;
export const GALLERY_MAX_FILE_MB = 40;
const PHOTO_MAX_SIDE = 2560;
/** Una foto que ya pesa menos que esto y no pasa del tamaño se sube tal cual. */
const PHOTO_KEEP_BYTES = 1.5 * MB;

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|3gp)$/i;
const PHOTO_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

const keyOf = (f: ChecklistAttachmentFile) => (f.fileId ? `id:${f.fileId}` : `url:${f.url ?? ''}`);

const mbLabel = (bytes: number) => `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`;

function isVideo(file: File) {
  return file.type.startsWith('video/') || VIDEO_EXT.test(file.name);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la foto'));
    img.src = url;
  });
}

/**
 * Reduce una foto a 2560 px por lado en JPG (calidad 0.86). El navegador ya la
 * endereza según su EXIF al dibujarla. Si no la puede leer (HEIC fuera de
 * Safari) o no gana nada, se sube la original.
 */
export async function optimizePhoto(file: File): Promise<File> {
  const isPhoto = /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || PHOTO_EXT.test(file.name);
  if (!isPhoto || typeof document === 'undefined') return file;
  const heic = /heic|heif/i.test(`${file.type} ${file.name}`);
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return file;
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h));
    if (!heic && scale === 1 && file.size <= PHOTO_KEEP_BYTES) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Fondo blanco: un PNG con transparencia no sale negro en JPG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob || (!heic && blob.size >= file.size)) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Entry = {
  key: string;
  file: ChecklistAttachmentFile;
  url: string;
  name: string;
  kind: MediaKind;
};

function tagOf(entry: Entry): string {
  if (entry.kind === 'video') return 'Video';
  if (entry.kind === 'link') return 'Link';
  const ext = entry.name.split('.').pop() || '';
  return ext && ext !== entry.name ? ext.toUpperCase().slice(0, 5) : 'Archivo';
}

function fmtTime(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

/** Miniatura de foto; si el navegador no la sabe pintar (HEIC fuera de Safari), recuadro con su tipo. */
function PhotoThumb({ entry }: { entry: Entry }) {
  const [failed, setFailed] = useState(false);
  if (failed || !entry.url) return <span className="hub-gallery__ext">{tagOf(entry)}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={entry.url} alt={entry.name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
  );
}

function VideoThumb({ entry }: { entry: Entry }) {
  return (
    <>
      {entry.url ? <video src={`${entry.url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden /> : null}
      <span className="hub-gallery__play" aria-hidden />
    </>
  );
}

export function GalleryField({
  item,
  readOnly,
  files,
  onPatch,
  onUpload,
}: {
  item: ChecklistItem;
  readOnly: boolean;
  /** Adjuntos ya subidos a este formato. */
  files: EventFile[];
  onPatch: (patch: Partial<ChecklistItem>) => void;
  onUpload?: (file: File) => Promise<EventFile | void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Las subidas tardan: al terminar se agrega sobre lo que haya EN ESE MOMENTO.
  const latest = useRef(item);
  latest.current = item;
  const [busy, setBusy] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState('');
  const [viewing, setViewing] = useState<number | null>(null);

  const resolve = useCallback(
    (f: ChecklistAttachmentFile, index: number): Entry => {
      const stored = f.fileId ? files.find((x) => x.id === f.fileId) : undefined;
      const url = stored?.url || f.url || '';
      const name = (f.name || stored?.fileName || url.split('/').pop() || 'Archivo').trim();
      return {
        key: f.fileId ? `id:${f.fileId}` : `url:${url}:${index}`,
        file: f,
        url,
        name,
        kind: mediaKind({ mimeType: f.mimeType || stored?.mimeType, name, url, fileId: f.fileId }),
      };
    },
    [files],
  );

  const entries = useMemo(() => attachmentFiles(item).map(resolve), [item, resolve]);
  /** Lo que se ve en grande (fotos y videos); links y documentos abren en otra pestaña. */
  const viewable = useMemo(() => entries.filter((e) => (e.kind === 'image' || e.kind === 'video') && e.url), [entries]);
  const accept = item.accept === 'media' ? 'image/*,video/*' : '.pdf,.xlsx,.xls,.csv,.docx,image/*,video/*';
  const pickable = files.filter((f) => !entries.some((e) => e.file.fileId === f.id));

  /** Todo queda en `files`; el adjunto de uno de antes pasa a ser el primero de la lista. */
  function commit(next: ChecklistAttachmentFile[]) {
    onPatch({ files: next, fileId: null, value: '' });
  }

  function remove(entry: Entry) {
    if (!window.confirm(`¿Quitar «${entry.name}» de este campo? El archivo sigue en los adjuntos del formato.`)) return;
    const gone = keyOf(entry.file);
    commit(attachmentFiles(latest.current).filter((f) => keyOf(f) !== gone));
  }

  async function addFiles(list: File[]) {
    if (!onUpload || !list.length) return;
    const added: ChecklistAttachmentFile[] = [];
    const errs: string[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const raw = list[i];
      const video = isVideo(raw);
      const max = video ? GALLERY_MAX_VIDEO_MB : GALLERY_MAX_FILE_MB;
      const of = list.length > 1 ? ` ${i + 1} de ${list.length}` : '';
      setBusy(video ? `Subiendo video${of} (${mbLabel(raw.size)})… no cierres esta pantalla` : `Subiendo${of}…`);
      const file = video ? raw : await optimizePhoto(raw);
      if (file.size > max * MB) {
        errs.push(
          `${raw.name}: pesa ${mbLabel(file.size)} y el máximo es ${max} MB${video ? '. Grábalo en 1080p o recórtalo.' : '.'}`,
        );
        continue;
      }
      try {
        const created = await onUpload(file);
        if (created && created.id) {
          added.push({
            fileId: created.id,
            name: created.fileName || file.name,
            url: created.url,
            mimeType: created.mimeType || file.type || null,
            sizeBytes: created.sizeBytes ?? file.size,
            at: new Date().toISOString(),
          });
        } else {
          errs.push(`${raw.name}: no se pudo subir.`);
        }
      } catch (e) {
        errs.push(`${raw.name}: ${e instanceof Error ? e.message : 'no se pudo subir'}.`);
      }
    }
    setBusy('');
    setProblems(errs);
    if (added.length) commit([...attachmentFiles(latest.current), ...added]);
  }

  function addLink() {
    const url = link.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setProblems(['El link tiene que empezar con https://']);
      return;
    }
    let host = 'link';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* se queda «link» */
    }
    commit([...attachmentFiles(latest.current), { url, name: `Álbum (${host})`, at: new Date().toISOString() }]);
    setLink('');
    setLinking(false);
    setProblems([]);
  }

  function addExisting(id: string) {
    const f = files.find((x) => x.id === id);
    if (!f) return;
    commit([
      ...attachmentFiles(latest.current),
      { fileId: f.id, name: f.fileName, url: f.url, mimeType: f.mimeType ?? null, sizeBytes: f.sizeBytes ?? null, at: new Date().toISOString() },
    ]);
  }

  return (
    <div className="hub-gallery">
      <p className="hub-gallery__count">{entries.length ? gallerySummary(entries.map((e) => e.file)) : 'Sin fotos ni videos todavía'}</p>

      {entries.length ? (
        <ul className="hub-gallery__grid">
          {entries.map((entry) => {
            const canView = viewable.includes(entry);
            const when = fmtTime(entry.file.at);
            return (
              <li key={entry.key} className={`hub-gallery__tile is-${entry.kind}`}>
                {canView ? (
                  <button
                    type="button"
                    className="hub-gallery__media"
                    onClick={() => setViewing(viewable.indexOf(entry))}
                    aria-label={`Ver ${entry.name}`}
                  >
                    {entry.kind === 'image' ? <PhotoThumb entry={entry} /> : <VideoThumb entry={entry} />}
                  </button>
                ) : (
                  <a className="hub-gallery__media" href={entry.url || undefined} target="_blank" rel="noreferrer" aria-label={`Abrir ${entry.name}`}>
                    <span className="hub-gallery__ext">{tagOf(entry)}</span>
                  </a>
                )}
                <span className="hub-gallery__name" title={entry.name}>
                  {entry.name}
                </span>
                {when ? <span className="hub-gallery__when">{when}</span> : null}
                {!readOnly ? (
                  <button type="button" className="hub-gallery__remove" onClick={() => remove(entry)} aria-label={`Quitar ${entry.name}`}>
                    ×
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!readOnly ? (
        <div className="hub-attach__actions">
          {onUpload ? (
            <>
              <button type="button" className="btn-quiet" disabled={!!busy} onClick={() => inputRef.current?.click()}>
                {item.accept === 'media' ? 'Agregar fotos o videos' : 'Agregar archivos'}
              </button>
              <input
                ref={inputRef}
                type="file"
                hidden
                multiple
                accept={accept}
                onChange={(e) => {
                  const list = Array.from(e.target.files || []);
                  e.target.value = '';
                  void addFiles(list);
                }}
              />
            </>
          ) : null}
          {pickable.length ? (
            <select
              className="hub-attach__pick"
              aria-label={`Agregar a ${item.label} uno de los adjuntos`}
              value=""
              disabled={!!busy}
              onChange={(e) => addExisting(e.target.value)}
            >
              <option value="">Agregar de los adjuntos…</option>
              {pickable.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fileName}
                </option>
              ))}
            </select>
          ) : null}
          {!linking ? (
            <button type="button" className="btn-quiet" onClick={() => setLinking(true)}>
              Pegar link de álbum
            </button>
          ) : null}
        </div>
      ) : null}

      {!readOnly && linking ? (
        <div className="hub-gallery__link">
          <input
            type="url"
            autoFocus
            placeholder="https://photos.app.goo.gl/…"
            value={link}
            aria-label="Link del álbum"
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLink();
              }
              if (e.key === 'Escape') setLinking(false);
            }}
          />
          <button type="button" className="btn-quiet" onClick={addLink}>
            Agregar
          </button>
          <button type="button" className="btn-quiet" onClick={() => setLinking(false)}>
            Cancelar
          </button>
        </div>
      ) : null}

      {busy ? (
        <p className="hub-gallery__busy" role="status">
          {busy}
        </p>
      ) : null}
      {problems.length ? (
        <ul className="hub-gallery__problems" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {!readOnly && onUpload && !entries.length && !busy ? (
        <p className="hub-gallery__hint">
          Desde el teléfono puedes tomar la foto o el video ahí mismo o elegir varios de la galería. Videos hasta{' '}
          {GALLERY_MAX_VIDEO_MB} MB.
        </p>
      ) : null}

      {viewing !== null && viewable[viewing] ? (
        <GalleryViewer entries={viewable} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      ) : null}
    </div>
  );
}

/** Visor a pantalla completa: foto o video, anterior/siguiente con flechas, Esc cierra. */
function GalleryViewer({
  entries,
  index,
  onIndex,
  onClose,
}: {
  entries: Entry[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const entry = entries[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const prev = useCallback(() => onIndex((index - 1 + entries.length) % entries.length), [index, entries.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % entries.length), [index, entries.length, onIndex]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && entries.length > 1) prev();
      else if (e.key === 'ArrowRight' && entries.length > 1) next();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next, entries.length]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="gallery-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={entry.name}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="gallery-viewer__bar">
        <span className="gallery-viewer__name">
          {entry.name}
          {entries.length > 1 ? ` · ${index + 1} de ${entries.length}` : ''}
        </span>
        <a className="gallery-viewer__btn" href={entry.url} target="_blank" rel="noreferrer">
          Abrir original
        </a>
        <button ref={closeRef} type="button" className="gallery-viewer__btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="gallery-viewer__stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {entry.kind === 'video' ? (
          <video key={entry.key} src={entry.url} controls autoPlay playsInline preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={entry.key} src={entry.url} alt={entry.name} />
        )}
      </div>
      {entry.kind === 'video' ? (
        <p className="gallery-viewer__note">Si el video no se reproduce en este navegador, usa «Abrir original» para descargarlo.</p>
      ) : null}
      {entries.length > 1 ? (
        <>
          <button type="button" className="gallery-viewer__nav is-prev" onClick={prev} aria-label="Anterior">
            ‹
          </button>
          <button type="button" className="gallery-viewer__nav is-next" onClick={next} aria-label="Siguiente">
            ›
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
