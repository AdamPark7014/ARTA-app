'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import '@/styles/studio.scss';
import { AppShell } from '@/components/app-shell/AppShell';
import { CollectionEditor } from '@/components/studio/CollectionEditor';
import { COLLECTIONS, type CollectionConfig, type StudioRow } from '@/components/studio/collections';
import type { FormValues } from '@/components/studio/FieldsForm';
import { HomeSections } from '@/components/studio/HomeSections';
import { PreviewPane, type PreviewHandle } from '@/components/studio/PreviewPane';
import { SectionEditor } from '@/components/studio/SectionEditor';
import { StudioOutline } from '@/components/studio/StudioOutline';
import { askConfirm } from '@/components/ui/AskDialog';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { ActionLink, FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { canPublishStudio, type RoleKey } from '@arta/rbac';
import { api } from '@/lib/api';
import {
  BLOCK_META,
  CUSTOM_DEFAULTS,
  CUSTOM_FIELDS,
  DEFAULT_CONTENT,
  HERO_KEY,
  LAYOUT_KEY,
  SECTION_FIELDS,
  SECTION_LABELS,
  SETTINGS_KEY,
  SITE_PAGES,
  anchorOf,
  pageHref,
  pageMeta,
  resolveLayout,
  resolvePages,
  sectionKeyOf,
  type BlockType,
  type CollectionKey,
  type LayoutBlock,
  type LayoutPage,
  type PageKey,
  type ServiceTile,
} from '@/lib/site-blocks';
import { withServiceDefaults } from '@/lib/site-model';
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

/** Los avisos de revisión llegan con `?tab=`: el nombre viejo de la pestaña o el del contenido. */
const TAB_TO_PAGE: Record<string, string> = {
  carousel: 'inicio',
  sections: 'inicio',
  news: 'noticias',
  shows: 'cartelera',
  historia: 'historias',
  foto: 'galeria',
  aliado: 'nosotros',
};

/** Nombres anteriores de `?bloque=`, cuando cada sección era una entrada. */
const OLD_BLOCKS: Record<string, string> = { portada: 'inicio', faq: 'preguntas', aliados: 'nosotros', ubicacion: 'contacto' };

const LINK_SUGGESTIONS = SITE_PAGES.map((page) => ({ value: pageHref(page.key), label: page.label }));

const COLLECTION_NOUNS: Partial<Record<CollectionKey, [string, string]>> = {
  slides: ['foto', 'fotos'],
  shows: ['show', 'shows'],
  news: ['noticia', 'noticias'],
  historia: ['historia', 'historias'],
  foto: ['foto', 'fotos'],
};

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Algo falló. Inténtalo de nuevo.';
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
  const [selected, setSelected] = useState('inicio');
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
    const bloque = params.get('bloque');
    const wanted = (bloque && (OLD_BLOCKS[bloque] || bloque)) || TAB_TO_PAGE[params.get('tab') || ''];
    if (wanted) setSelected(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const live = useMemo(() => new Map(pages.filter((p) => !isProposal(p)).map((p) => [p.sectionKey, p])), [pages]);
  const proposals = useMemo(
    () => new Map(pages.filter(isProposal).map((p) => [p.sectionKey.slice(0, -PROPOSAL_SUFFIX.length), p])),
    [pages],
  );

  const layout = (proposals.get(LAYOUT_KEY) ?? live.get(LAYOUT_KEY))?.contentJson;
  const blocks = useMemo(() => resolveLayout(layout), [layout]);
  const menuPages = useMemo(() => resolvePages(layout), [layout]);

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

  const hasDraftIn = useCallback((key: PageKey) => pageMeta(key).sections.some((section) => proposals.has(section)), [proposals]);

  /** Una línea por página en la lista: qué tiene y en qué estado está. */
  const statusOf = useCallback(
    (page: LayoutPage) => {
      if (!page.visible) return 'Quitada del sitio';
      if (hasDraftIn(page.key)) return 'Borrador sin publicar';
      if (page.key === 'nosotros') return 'Textos, fotos y aliados';
      if (page.key === 'contacto') return 'Formulario, dirección y mapa';
      const textOf = (key: string, field: string, noun: string, plural: string) => {
        const list = (proposals.get(key) ?? live.get(key))?.contentJson?.[field] ?? DEFAULT_CONTENT[key]?.[field];
        const total = Array.isArray(list) ? list.length : 0;
        return `${total} ${total === 1 ? noun : plural}`;
      };
      if (page.key === 'servicios') return textOf('home_modulos', 'tiles', 'servicio', 'servicios');
      if (page.key === 'preguntas') return textOf('home_faq', 'faqs', 'pregunta', 'preguntas');
      const key = pageMeta(page.key).collections[0];
      const noun = key ? COLLECTION_NOUNS[key] : undefined;
      if (!key || !noun) return 'Textos y fotos';
      const rows = rowsOf(key);
      if (!rows.length) {
        const hidden = page.key === 'historias' || page.key === 'galeria';
        return hidden ? `Sin ${noun[1]}: aún no sale en el menú` : `Sin ${noun[1]} todavía`;
      }
      const draftCount = rows.filter((r) => !COLLECTIONS[key].view(r).live).length;
      const label = `${rows.length} ${rows.length === 1 ? noun[0] : noun[1]}`;
      return draftCount ? `${label} · ${draftCount} sin publicar` : label;
    },
    [hasDraftIn, proposals, live, rowsOf],
  );

  const blockDrafts = useMemo(() => {
    const out = new Set<string>();
    for (const block of blocks) if (proposals.has(sectionKeyOf(block))) out.add(block.id);
    return out;
  }, [blocks, proposals]);

  /** Lo que espera publicarse o revisarse: lo enseña la barra de arriba. */
  const pendingSections = useMemo(() => {
    const names = new Map<string, string>();
    for (const key of proposals.keys()) {
      if (key === LAYOUT_KEY) names.set(key, 'El orden del sitio');
      else if (key === HERO_KEY) names.set(key, 'Portada');
      else if (key === SETTINGS_KEY) names.set(key, 'Datos del sitio');
      else {
        const page = SITE_PAGES.find((p) => p.sections.includes(key));
        const block = blocks.find((b) => sectionKeyOf(b) === key);
        names.set(key, page ? page.label : block ? labelOf(block) : proposals.get(key)?.title || key);
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
    const blockOf: Record<string, string> = { historia: 'historias', foto: 'galeria', aliado: 'nosotros' };
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

  /** La vista previa abre la página que se está editando. */
  function showInPreview(id: string) {
    const custom = blocks.find((b) => b.id === id && BLOCK_META[b.type].custom);
    if (custom) {
      preview.current?.post({ type: 'page', page: 'inicio' });
      preview.current?.post({ type: 'scrollTo', anchor: anchorOf(custom) });
      return;
    }
    const page = SITE_PAGES.find((p) => p.key === id);
    // Los datos del sitio salen sobre todo en Contacto.
    preview.current?.post({ type: 'page', page: page ? page.key : 'contacto' });
  }

  function selectBlock(id: string) {
    setSelected(id);
    showInPreview(id);
    // En el teléfono el editor queda debajo de la lista: que se vea qué se abrió.
    if (window.matchMedia('(max-width: 820px)').matches) {
      requestAnimationFrame(() => document.querySelector('.st-editor')?.scrollIntoView({ block: 'start' }));
    }
  }

  const previewReady = () => showInPreview(selected);

  // ─── Maqueta ───────────────────────────────────────────────────────────────

  async function saveLayout(nextBlocks: LayoutBlock[], nextPages: LayoutPage[] = menuPages) {
    preview.current?.post({ type: 'layout', blocks: nextBlocks, pages: nextPages });
    await run(async () => {
      await api('/studio/pages', {
        method: 'PUT',
        body: JSON.stringify({
          sectionKey: LAYOUT_KEY,
          title: 'Maqueta',
          draft: true,
          contentJson: { blocks: nextBlocks, pages: nextPages },
        }),
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

  function movePage(index: number, delta: number) {
    const next = [...menuPages];
    const [page] = next.splice(index, 1);
    next.splice(index + delta, 0, page);
    void saveLayout(blocks, next);
  }

  function togglePage(page: LayoutPage) {
    void saveLayout(blocks, menuPages.map((p) => (p.key === page.key ? { ...p, visible: !p.visible } : p)));
  }

  function addBlock(type: BlockType) {
    const id = Math.random().toString(36).slice(2, 10);
    const next = [...blocks, { id, type, visible: true }];
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
    if (selected === block.id) setSelected('inicio');
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

  const customBlock = blocks.find((b) => b.id === selected && BLOCK_META[b.type].custom);
  const isSettings = selected === 'ajustes';
  const currentPage = SITE_PAGES.find((p) => p.key === selected) ?? (customBlock || isSettings ? undefined : pageMeta('inicio'));

  const title = isSettings ? 'Datos del sitio' : customBlock ? labelOf(customBlock) : (currentPage as NonNullable<typeof currentPage>).label;
  const description = isSettings
    ? 'Lo que sale en el pie y en contacto: correo, teléfono, WhatsApp, redes y lema.'
    : customBlock
      ? BLOCK_META[customBlock.type].description
      : (currentPage as NonNullable<typeof currentPage>).description;

  const pendingNames = [...pendingSections.values()];

  /** Los textos de una sección: el borrador si hay, si no lo publicado o el texto de arranque. */
  function sectionEditor(sectionKey: string, type?: BlockType, heading?: string) {
    const draftRow = proposals.get(sectionKey);
    const saved = (draftRow ?? live.get(sectionKey))?.contentJson;
    const fields = (type && CUSTOM_FIELDS[type]) || SECTION_FIELDS[sectionKey] || [];
    const name = heading || SECTION_LABELS[sectionKey] || title;
    const initial = {
      ...(DEFAULT_CONTENT[sectionKey] ?? (type ? CUSTOM_DEFAULTS[type] : undefined) ?? {}),
      ...saved,
    };
    // El formulario enseña lo mismo que el sitio: un servicio viejo trae aquí su detalle de arranque.
    if (sectionKey === 'home_modulos' && Array.isArray(initial.tiles)) {
      initial.tiles = (initial.tiles as ServiceTile[]).map(withServiceDefaults);
    }
    return (
      <SectionEditor
        key={sectionKey}
        fields={fields}
        initial={initial}
        hasDraft={!!draftRow}
        canPublish={canPublish}
        busy={busy}
        linkOptions={LINK_SUGGESTIONS}
        onLive={(values) => preview.current?.post({ type: 'section', sectionKey, contentJson: values })}
        onSave={(values, publish) => saveSection(sectionKey, name, values, publish)}
        onDiscard={() => discardDraft(sectionKey, name)}
        onReview={() => requestSectionReview(sectionKey)}
        onError={(text) => say('error', text)}
      />
    );
  }

  function collectionEditor(key: CollectionKey) {
    const config = COLLECTIONS[key];
    return (
      <CollectionEditor
        key={key}
        config={config}
        rows={rowsOf(key)}
        canPublish={canPublish}
        busy={busy}
        linkOptions={LINK_SUGGESTIONS}
        onSave={(values, id, publish) => saveRow(config, values, id, publish)}
        onSetLive={(row, value) => setRowLive(config, row, value)}
        onRemove={(row) => removeRow(config, row)}
        onMove={(ids) => moveRows(config, ids)}
        onReview={async (row) => {
          await reviewRow(config, row);
        }}
        onError={(text) => say('error', text)}
      />
    );
  }

  /** Editor de la página: su contenido primero y sus textos después. */
  function pageEditor(page: NonNullable<typeof currentPage>) {
    const texts = (key: string) => (
      <details className="st-texts" key={`t-${key}`}>
        <summary>{SECTION_LABELS[key]}</summary>
        {sectionEditor(key)}
      </details>
    );
    if (page.key === 'inicio') {
      return (
        <>
          <h3 className="st-subtitle">Fotos de la portada</h3>
          {collectionEditor('slides')}
          <HomeSections
            blocks={blocks}
            pages={menuPages}
            drafts={blockDrafts}
            labelOf={labelOf}
            busy={busy}
            onOpen={(block) => selectBlock(BLOCK_META[block.type].custom ? block.id : (BLOCK_META[block.type].page as string))}
            onMove={moveBlock}
            onToggle={toggleBlock}
            onRemove={(block) => void removeBlock(block)}
            onAdd={addBlock}
          />
          {texts(HERO_KEY)}
        </>
      );
    }
    if (page.key === 'nosotros') {
      return (
        <>
          {sectionEditor('home_about')}
          <h3 className="st-subtitle">Aliados</h3>
          {collectionEditor('aliado')}
          {texts('home_aliados')}
        </>
      );
    }
    if (page.collections.length) {
      return (
        <>
          {collectionEditor(page.collections[0])}
          {page.sections.map(texts)}
        </>
      );
    }
    const [first, ...rest] = page.sections;
    return (
      <>
        {sectionEditor(first)}
        {rest.map(texts)}
      </>
    );
  }

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
                      <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={() => void discardDraft(LAYOUT_KEY, 'el orden del sitio')}>
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
                pages={menuPages}
                selected={customBlock ? 'inicio' : isSettings ? 'ajustes' : (currentPage as NonNullable<typeof currentPage>).key}
                statusOf={statusOf}
                settingsDraft={proposals.has(SETTINGS_KEY)}
                busy={busy}
                onSelect={selectBlock}
                onMove={movePage}
                onToggle={togglePage}
              />

              <section className="st-editor" aria-labelledby="st-editor-title">
                <header className="st-editor__head">
                  {customBlock ? (
                    <button type="button" className="btn-quiet st-back" onClick={() => selectBlock('inicio')}>
                      ← Inicio
                    </button>
                  ) : null}
                  <div className="st-editor__title">
                    <h2 id="st-editor-title">{title}</h2>
                    {currentPage ? (
                      <a className="st-pagelink" href={pageHref(currentPage.key)} target="_blank" rel="noopener noreferrer">
                        Ver página publicada
                      </a>
                    ) : null}
                  </div>
                  <p>{description}</p>
                  {currentPage && !menuPages.find((p) => p.key === currentPage.key)?.visible ? (
                    <p className="st-banner">
                      <strong>Esta página está quitada del sitio.</strong> Tócala en «Poner», en la lista de páginas, para que vuelva a salir.
                    </p>
                  ) : null}
                  {customBlock && !customBlock.visible ? (
                    <p className="st-banner">
                      <strong>Esta sección está quitada de Inicio.</strong> Tócala en «Poner» para que vuelva a salir.
                    </p>
                  ) : null}
                </header>

                {isSettings
                  ? sectionEditor(SETTINGS_KEY)
                  : customBlock
                    ? sectionEditor(sectionKeyOf(customBlock), customBlock.type, labelOf(customBlock))
                    : pageEditor(currentPage as NonNullable<typeof currentPage>)}
              </section>

              <div className={`st-preview-slot ${previewOpen ? 'is-open' : ''}`.trim()}>
                <PreviewPane ref={preview} onClose={() => setPreviewOpen(false)} onReady={previewReady} />
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
