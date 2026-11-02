'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import '@/styles/studio.scss';
import { AppShell } from '@/components/app-shell/AppShell';
import { CollectionEditor } from '@/components/studio/CollectionEditor';
import { COLLECTIONS, type CollectionConfig, type StudioRow } from '@/components/studio/collections';
import type { FormValues } from '@/components/studio/FieldsForm';
import { PreviewPane, type PreviewHandle } from '@/components/studio/PreviewPane';
import { SectionEditor } from '@/components/studio/SectionEditor';
import { StudioOutline, type OutlineCount } from '@/components/studio/StudioOutline';
import { askConfirm } from '@/components/ui/AskDialog';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { ActionLink, FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { canPublishStudio, type RoleKey } from '@arta/rbac';
import { api } from '@/lib/api';
import {
  BLOCK_COLLECTION,
  BLOCK_META,
  CUSTOM_DEFAULTS,
  CUSTOM_FIELDS,
  DEFAULT_CONTENT,
  HERO_KEY,
  LAYOUT_KEY,
  SECTION_FIELDS,
  SETTINGS_KEY,
  anchorOf,
  resolveLayout,
  sectionKeyOf,
  type BlockType,
  type CollectionKey,
  type Field,
  type LayoutBlock,
} from '@/lib/site-blocks';
import { uniqueSlug } from '@/lib/studio-templates';
import { useUser } from '@/lib/user-context';

type Page = {
  id: string;
  sectionKey: string;
  title?: string | null;
  contentJson: Record<string, unknown>;
  published: boolean;
};

/**
 * Borrador de una sección: fila aparte, nunca publicada (la API la guarda así; ver
 * studio.controller.ts · PROPOSAL_SUFFIX). Practicantes y quien publica escriben ahí.
 */
const PROPOSAL_SUFFIX = '__propuesta';
const isProposal = (p: Page) => p.sectionKey.endsWith(PROPOSAL_SUFFIX);

type Notice = { variant: 'success' | 'error' | 'warn' | 'info'; text: string };

/** Avisos viejos llegan con `?tab=`; los nuevos, con el nombre del contenido. */
const TAB_TO_BLOCK: Record<string, string> = {
  carousel: 'portada',
  sections: 'portada',
  news: 'noticias',
  shows: 'cartelera',
  historia: 'historias',
  foto: 'galeria',
  aliado: 'aliados',
};

const LINK_SUGGESTIONS = [
  { value: '#cartelera', label: 'Cartelera' },
  { value: '#historias', label: 'Historias' },
  { value: '#nosotros', label: 'Nosotros' },
  { value: '#modulos', label: 'Lo que hacemos' },
  { value: '#noticias', label: 'Noticias' },
  { value: '#galeria', label: 'Galería' },
  { value: '#contacto', label: 'Contacto' },
];

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Algo falló. Inténtalo de nuevo.';
}

function rowsDraftCount(config: CollectionConfig, rows: StudioRow[]): OutlineCount {
  return { total: rows.length, drafts: rows.filter((r) => !config.view(r).live).length };
}

export default function StudioPage() {
  const { entity, setEntity, user } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [slides, setSlides] = useState<StudioRow[]>([]);
  const [news, setNews] = useState<StudioRow[]>([]);
  const [items, setItems] = useState<StudioRow[]>([]);
  const [selected, setSelected] = useState('portada');
  const [previewOpen, setPreviewOpen] = useState(false);
  const preview = useRef<PreviewHandle | null>(null);

  /**
   * Junta 23-10-2026: el practicante deja borradores y dirección publica, salvo que su perfil le dé
   * `studio.publish`. La API aplica la misma regla (`canPublishStudio`).
   */
  const canPublish = !!user && canPublishStudio(user.roleKey as RoleKey, user.permissions || []);

  useEffect(() => {
    if (entity !== 'ARTA') setEntity('ARTA');
  }, [entity, setEntity]);

  const load = useCallback(async () => {
    const [p, s, n, i] = await Promise.all([
      api<Page[]>('/studio/pages'),
      api<StudioRow[]>('/studio/slides'),
      api<StudioRow[]>('/studio/news?all=1'),
      api<StudioRow[]>('/studio/items'),
    ]);
    setPages(p);
    setSlides(s);
    setNews(n);
    setItems(i);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!user.entities.includes('ARTA')) {
      router.replace('/dashboard');
      return;
    }
    setLoading(true);
    load()
      .catch((e) => setNotice({ variant: 'error', text: errorText(e) }))
      .finally(() => setLoading(false));
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('bloque') || TAB_TO_BLOCK[params.get('tab') || ''];
    if (wanted) setSelected(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const live = useMemo(() => new Map(pages.filter((p) => !isProposal(p)).map((p) => [p.sectionKey, p])), [pages]);
  const proposals = useMemo(
    () => new Map(pages.filter(isProposal).map((p) => [p.sectionKey.slice(0, -PROPOSAL_SUFFIX.length), p])),
    [pages],
  );

  const blocks = useMemo(
    () => resolveLayout((proposals.get(LAYOUT_KEY) ?? live.get(LAYOUT_KEY))?.contentJson),
    [proposals, live],
  );

  const rowsOf = useCallback(
    (key: CollectionKey): StudioRow[] => {
      if (key === 'slides') return slides;
      if (key === 'shows') {
        return news
          .filter((n) => n.template === 'evento')
          .sort((a, b) => String(a.eventDate || '9').localeCompare(String(b.eventDate || '9')));
      }
      if (key === 'news') return news.filter((n) => n.template !== 'evento');
      return items.filter((i) => i.kind === key);
    },
    [slides, news, items],
  );

  const labelOf = useCallback(
    (block: LayoutBlock) => {
      if (!BLOCK_META[block.type].custom) return BLOCK_META[block.type].label;
      const saved = (proposals.get(sectionKeyOf(block)) ?? live.get(sectionKeyOf(block)))?.contentJson?.headline;
      return typeof saved === 'string' && saved.trim() ? saved : BLOCK_META[block.type].label;
    },
    [proposals, live],
  );

  const counts = useMemo(() => {
    const out: Record<string, OutlineCount | undefined> = { portada: rowsDraftCount(COLLECTIONS.slides, slides) };
    for (const block of blocks) {
      const key = BLOCK_COLLECTION[block.type];
      if (key) out[block.id] = rowsDraftCount(COLLECTIONS[key], rowsOf(key));
    }
    return out;
  }, [blocks, rowsOf, slides]);

  const blockDrafts = useMemo(() => {
    const out = new Set<string>();
    if (proposals.has(SETTINGS_KEY)) out.add('ajustes');
    for (const block of blocks) if (proposals.has(sectionKeyOf(block))) out.add(block.id);
    return out;
  }, [blocks, proposals]);

  /** Lo que espera publicarse o revisarse: lo enseña la barra de arriba. */
  const pendingSections = useMemo(() => {
    const names = new Map<string, string>();
    for (const key of proposals.keys()) {
      if (key === LAYOUT_KEY) names.set(key, 'El orden de la página');
      else if (key === HERO_KEY) names.set(key, 'Portada');
      else if (key === SETTINGS_KEY) names.set(key, 'Datos del sitio');
      else {
        const block = blocks.find((b) => sectionKeyOf(b) === key);
        names.set(key, block ? labelOf(block) : proposals.get(key)?.title || key);
      }
    }
    return names;
  }, [proposals, blocks, labelOf]);

  const inReview = useMemo(() => {
    const out: Array<{ id: string; title: string; block: string }> = [];
    for (const n of news) {
      if (!n.published && n.reviewRequestedAt) {
        out.push({ id: n.id, title: n.title, block: n.template === 'evento' ? 'cartelera' : 'noticias' });
      }
    }
    const blockOf: Record<string, string> = { historia: 'historias', foto: 'galeria', aliado: 'aliados' };
    for (const i of items) {
      if (!i.active && i.reviewRequestedAt) out.push({ id: i.id, title: i.title || 'Sin título', block: blockOf[i.kind] });
    }
    return out;
  }, [news, items]);

  function say(variant: Notice['variant'], text: string) {
    setNotice({ variant, text });
  }

  /** Lo publicado se ve de inmediato en vez de esperar la caché del sitio. */
  async function refreshPublicSite() {
    await fetch('/p/arta/revalidar', { method: 'POST' }).catch(() => undefined);
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
      return true;
    } catch (e) {
      say('error', errorText(e));
      await load().catch(() => undefined);
      return false;
    } finally {
      setBusy(false);
      preview.current?.post({ type: 'reload' });
    }
  }

  function scrollPreviewTo(id: string) {
    if (id === 'ajustes' || id === 'portada') {
      preview.current?.post({ type: 'scrollTo', anchor: id === 'ajustes' ? 'contacto' : 'portada' });
      return;
    }
    const target = blocks.find((b) => b.id === id);
    if (target) preview.current?.post({ type: 'scrollTo', anchor: anchorOf(target) });
  }

  function selectBlock(id: string) {
    setSelected(id);
    scrollPreviewTo(id);
    // En el teléfono el editor queda debajo de la lista: que se vea qué se abrió.
    if (window.matchMedia('(max-width: 820px)').matches) {
      requestAnimationFrame(() => document.querySelector('.st-editor')?.scrollIntoView({ block: 'start' }));
    }
  }

  // La vista previa abre donde se está editando.
  const scrollPreviewToSelected = () => scrollPreviewTo(selected);

  // ─── Maqueta ───────────────────────────────────────────────────────────────

  async function saveLayout(next: LayoutBlock[]) {
    preview.current?.post({ type: 'layout', blocks: next });
    await run(async () => {
      await api('/studio/pages', {
        method: 'PUT',
        body: JSON.stringify({ sectionKey: LAYOUT_KEY, title: 'Maqueta', draft: true, contentJson: { blocks: next } }),
      });
      await load();
    });
  }

  function moveBlock(index: number, delta: number) {
    const next = [...blocks];
    const [block] = next.splice(index, 1);
    next.splice(index + delta, 0, block);
    void saveLayout(next);
  }

  function toggleBlock(block: LayoutBlock) {
    void saveLayout(blocks.map((b) => (b.id === block.id ? { ...b, visible: !b.visible } : b)));
  }

  function addBlock(type: BlockType) {
    const id = Math.random().toString(36).slice(2, 10);
    const at = blocks.findIndex((b) => b.id === selected);
    const next = [...blocks];
    next.splice(at >= 0 ? at + 1 : next.length, 0, { id, type, visible: true });
    setSelected(id);
    void saveLayout(next);
  }

  async function removeBlock(block: LayoutBlock) {
    const yes = await askConfirm({
      title: `¿Borrar «${labelOf(block)}»?`,
      body: 'Sale de la maqueta y, al publicar, se borra su contenido.',
      confirmLabel: 'Borrar sección',
      danger: true,
    });
    if (!yes) return;
    if (selected === block.id) setSelected('portada');
    void saveLayout(blocks.filter((b) => b.id !== block.id));
  }

  async function publishDrafts() {
    const ok = await run(async () => {
      await api('/studio/pages/publish', { method: 'POST', body: JSON.stringify({}) });
      await load();
      await refreshPublicSite();
    });
    if (ok) say('success', 'Publicado. Ya se ve en el sitio.');
  }

  async function sendDraftsToReview() {
    const ok = await run(async () => {
      for (const key of proposals.keys()) {
        await api('/studio/review', { method: 'POST', body: JSON.stringify({ kind: 'section', id: key }) });
      }
      await load();
    });
    if (ok) say('success', 'Enviado a revisión: dirección ya recibió el aviso.');
  }

  async function discardDraft(sectionKey: string, label: string) {
    const yes = await askConfirm({
      title: `¿Descartar el borrador de «${label}»?`,
      body: 'Lo publicado se queda como está.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!yes) return;
    const ok = await run(async () => {
      await api(`/studio/pages/${sectionKey}/proposal`, { method: 'DELETE' });
      await load();
    });
    if (ok) say('info', 'Borrador descartado');
  }

  // ─── Secciones ─────────────────────────────────────────────────────────────

  async function saveSection(sectionKey: string, title: string, values: FormValues, publish: boolean) {
    const contentJson = cleanContent(values);
    const ok = await run(async () => {
      await api('/studio/pages', {
        method: 'PUT',
        body: JSON.stringify(
          publish ? { sectionKey, title, contentJson, published: true } : { sectionKey, title, contentJson, draft: true },
        ),
      });
      await load();
      if (publish) await refreshPublicSite();
    });
    if (ok) {
      say(
        'success',
        publish ? 'Publicado. Ya se ve en el sitio.' : canPublish ? 'Borrador guardado.' : 'Borrador guardado. Cuando esté listo, mándalo a revisión.',
      );
    }
    return ok;
  }

  async function requestSectionReview(sectionKey: string) {
    const ok = await run(async () => {
      await api('/studio/review', { method: 'POST', body: JSON.stringify({ kind: 'section', id: sectionKey }) });
      await load();
    });
    if (ok) say('success', 'Enviado a revisión: dirección ya recibió el aviso.');
  }

  // ─── Contenido (portada, shows, noticias, historias, galería, aliados) ─────

  async function saveRow(config: CollectionConfig, values: FormValues, id: string | null, publish: boolean | undefined) {
    const payload: Record<string, unknown> = { ...config.toPayload(values) };
    if (config.liveField === 'published' && !payload.slug) {
      const taken = news.filter((n) => n.id !== id).map((n) => String(n.slug));
      payload.slug = uniqueSlug(String(payload.title), taken);
    }
    if (publish !== undefined) payload[config.liveField] = publish;
    else if (id) payload[config.liveField] = true;
    if (!id && config.key === 'slides') {
      payload.sortOrder = Math.min(0, ...slides.map((s) => Number(s.sortOrder) || 0)) - 1;
    }
    const ok = await run(async () => {
      await api(id ? `${config.endpoint}/${id}` : config.endpoint, {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      await load();
      if (publish !== false) await refreshPublicSite();
    });
    if (ok) {
      say(
        'success',
        publish === false
          ? canPublish
            ? 'Borrador guardado: revísalo en la vista previa.'
            : 'Borrador guardado. Revísalo en la vista previa y mándalo a revisión.'
          : 'Publicado. Ya se ve en el sitio.',
      );
    }
    return ok;
  }

  async function setRowLive(config: CollectionConfig, row: StudioRow, value: boolean) {
    const body =
      config.key === 'slides'
        ? {
            imageUrl: row.imageUrl,
            title: row.title,
            subtitle: row.subtitle,
            ctaLabel: row.ctaLabel,
            ctaHref: row.ctaHref,
            sortOrder: row.sortOrder,
            active: value,
          }
        : config.liveField === 'published'
          ? { slug: row.slug, title: row.title, published: value }
          : { active: value };
    const ok = await run(async () => {
      await api(`${config.endpoint}/${row.id}`, { method: 'PUT', body: JSON.stringify(body) });
      await load();
      await refreshPublicSite();
    });
    if (ok) say('success', value ? 'Publicado. Ya se ve en el sitio.' : 'Lo quitamos del sitio: quedó como borrador.');
  }

  async function removeRow(config: CollectionConfig, row: StudioRow) {
    const ok = await run(async () => {
      await api(`${config.endpoint}/${row.id}`, { method: 'DELETE' });
      await load();
      await refreshPublicSite();
    });
    if (ok) say('info', 'Quitado.');
  }

  async function moveRows(config: CollectionConfig, ids: string[]) {
    const order = new Map(ids.map((id, i) => [id, i]));
    const sorted = (rows: StudioRow[]) => [...rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    if (config.key === 'slides') setSlides(sorted);
    else if (config.key === 'news') {
      // La lista del API incluye los shows; el orden solo acomoda las noticias.
      setNews((all) => [...sorted(all.filter((n) => n.template !== 'evento')), ...all.filter((n) => n.template === 'evento')]);
    } else {
      setItems((all) => [...sorted(all.filter((i) => i.kind === config.key)), ...all.filter((i) => i.kind !== config.key)]);
    }
    const allIds = config.key === 'news' ? [...ids, ...news.filter((n) => n.template === 'evento').map((n) => n.id)] : ids;
    await run(async () => {
      await api('/studio/reorder', {
        method: 'POST',
        body: JSON.stringify({ kind: config.key === 'slides' ? 'slide' : config.key === 'news' ? 'news' : config.key, ids: allIds }),
      });
      await load();
      await refreshPublicSite();
    });
  }

  async function reviewRow(config: CollectionConfig, row: StudioRow) {
    const ok = await run(async () => {
      const res = await api<{ notified: number }>('/studio/review', {
        method: 'POST',
        body: JSON.stringify({ kind: config.reviewKind, id: row.id }),
      });
      await load();
      say(
        'success',
        res.notified
          ? `Enviado a revisión: avisamos a ${res.notified} persona${res.notified === 1 ? '' : 's'} de dirección.`
          : 'Enviado a revisión.',
      );
    });
    return ok;
  }

  // ─── Pantalla ──────────────────────────────────────────────────────────────

  const block = blocks.find((b) => b.id === selected);
  const isPortada = selected === 'portada' || (!block && selected !== 'ajustes');
  const isSettings = selected === 'ajustes';
  const sectionKey = isSettings ? SETTINGS_KEY : isPortada ? HERO_KEY : sectionKeyOf(block as LayoutBlock);
  const blockType = block?.type;
  const collectionKey: CollectionKey | undefined = isPortada ? 'slides' : blockType ? BLOCK_COLLECTION[blockType] : undefined;
  const fields: Field[] = (blockType && CUSTOM_FIELDS[blockType]) || SECTION_FIELDS[sectionKey] || [];
  const title = isSettings ? 'Datos del sitio' : isPortada ? 'Portada' : labelOf(block as LayoutBlock);
  const description = isSettings
    ? 'Lo que sale en el pie y en contacto: correo, teléfono, WhatsApp, redes y lema.'
    : isPortada
      ? 'Lo primero que se ve: los próximos shows y tus fotos, a pantalla completa.'
      : BLOCK_META[(block as LayoutBlock).type].description;

  const draftRow = proposals.get(sectionKey);
  const savedContent = (draftRow ?? live.get(sectionKey))?.contentJson;
  const initial = useMemo<FormValues>(
    () => ({
      ...(DEFAULT_CONTENT[sectionKey] ?? (blockType ? CUSTOM_DEFAULTS[blockType] : undefined) ?? {}),
      ...savedContent,
    }),
    [sectionKey, blockType, savedContent],
  );

  const pendingNames = [...pendingSections.values()];

  const sectionEditor = (
    <SectionEditor
      key={sectionKey}
      fields={fields}
      initial={initial}
      hasDraft={!!draftRow}
      canPublish={canPublish}
      busy={busy}
      linkOptions={LINK_SUGGESTIONS}
      onLive={(values) => preview.current?.post({ type: 'section', sectionKey, contentJson: values })}
      onSave={(values, publish) => saveSection(sectionKey, title, values, publish)}
      onDiscard={() => discardDraft(sectionKey, title)}
      onReview={() => requestSectionReview(sectionKey)}
      onError={(text) => say('error', text)}
    />
  );

  return (
    <AppShell title="Studio · Sitio Arta">
      <div className="stack page-workspace st-page">
        <PageHeader
          title="Studio"
          description={
            canPublish
              ? 'Todo lo que se ve en artaproducciones.com se edita aquí.'
              : 'Todo lo que se ve en artaproducciones.com se edita aquí. Lo tuyo queda como borrador y dirección lo publica.'
          }
        >
          {user?.roleKey !== 'practicante' ? (
            <ActionLink href="/studio/practicantes" variant="ghost">
              Perfiles de practicante
            </ActionLink>
          ) : null}
          <a className="btn ghost" href="/p/arta" target="_blank" rel="noopener noreferrer">
            Ver sitio
          </a>
          <button className="btn ghost st-preview-toggle" type="button" onClick={() => setPreviewOpen(true)}>
            Vista previa
          </button>
        </PageHeader>

        {loading ? (
          <LoadingBlock rows={6} label="Cargando Studio…" />
        ) : (
          <>
            {pendingNames.length ? (
              <div className="st-pending" role="status">
                <div>
                  <strong>{canPublish ? 'Cambios sin publicar' : 'Tus borradores'}</strong>
                  <span>{pendingNames.join(' · ')}</span>
                </div>
                {canPublish ? (
                  <div className="st-pending__actions">
                    {proposals.has(LAYOUT_KEY) ? (
                      <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={() => void discardDraft(LAYOUT_KEY, 'el orden de la página')}>
                        Descartar orden
                      </button>
                    ) : null}
                    <button className="btn btn-sm" type="button" disabled={busy} onClick={() => void publishDrafts()}>
                      Publicar todo
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-sm" type="button" disabled={busy} onClick={() => void sendDraftsToReview()}>
                    Enviar a revisión
                  </button>
                )}
              </div>
            ) : null}
            {canPublish && inReview.length ? (
              <div className="st-pending st-pending--review" role="status">
                <div>
                  <strong>Por revisar</strong>
                  <span>Mandado por practicantes</span>
                </div>
                <div className="st-pending__actions">
                  {inReview.slice(0, 4).map((r) => (
                    <button key={r.id} className="btn ghost btn-sm" type="button" onClick={() => selectBlock(r.block)}>
                      {r.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {notice ? (
              <FlashMessage variant={notice.variant} onDismiss={() => setNotice(null)}>
                {notice.text}
              </FlashMessage>
            ) : null}

            <div className="st-grid">
              <StudioOutline
                blocks={blocks}
                selected={isPortada ? 'portada' : selected}
                counts={counts}
                drafts={blockDrafts}
                labelOf={labelOf}
                busy={busy}
                onSelect={selectBlock}
                onMove={moveBlock}
                onToggle={toggleBlock}
                onRemove={(b) => void removeBlock(b)}
                onAdd={addBlock}
              />

              <section className="st-editor" aria-labelledby="st-editor-title">
                <header className="st-editor__head">
                  <h2 id="st-editor-title">{title}</h2>
                  <p>{description}</p>
                  {block && !block.visible ? (
                    <p className="st-banner">
                      <strong>Esta sección está quitada del sitio.</strong> Tócala en «Poner» para que vuelva a salir.
                    </p>
                  ) : null}
                </header>

                {collectionKey ? (
                  <CollectionEditor
                    config={COLLECTIONS[collectionKey]}
                    rows={rowsOf(collectionKey)}
                    canPublish={canPublish}
                    busy={busy}
                    linkOptions={LINK_SUGGESTIONS}
                    onSave={(values, id, publish) => saveRow(COLLECTIONS[collectionKey], values, id, publish)}
                    onSetLive={(row, value) => setRowLive(COLLECTIONS[collectionKey], row, value)}
                    onRemove={(row) => removeRow(COLLECTIONS[collectionKey], row)}
                    onMove={(ids) => moveRows(COLLECTIONS[collectionKey], ids)}
                    onReview={async (row) => {
                      await reviewRow(COLLECTIONS[collectionKey], row);
                    }}
                    onError={(text) => say('error', text)}
                  />
                ) : null}

                {fields.length ? (
                  collectionKey ? (
                    <details className="st-texts">
                      <summary>Textos de la sección</summary>
                      {sectionEditor}
                    </details>
                  ) : (
                    sectionEditor
                  )
                ) : null}
              </section>

              <div className={`st-preview-slot ${previewOpen ? 'is-open' : ''}`.trim()}>
                <PreviewPane ref={preview} onClose={() => setPreviewOpen(false)} onReady={scrollPreviewToSelected} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

/** Las filas vacías de una lista no se guardan. */
function cleanContent(values: FormValues): FormValues {
  const out: FormValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      out[key] = value.filter((row) => Object.values((row || {}) as object).some((v) => String(v ?? '').trim()));
    } else {
      out[key] = value;
    }
  }
  return out;
}
