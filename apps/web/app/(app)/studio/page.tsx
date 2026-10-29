'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  ActionLink,
  FieldCheck,
  FilterBar,
  FlashMessage,
  FormGrid,
  PageHeader,
} from '@/components/ui/PageChrome';
import { canPublishStudio, type RoleKey } from '@arta/rbac';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import {
  NEWS_TEMPLATES,
  eventDateLabel,
  missingForNews,
  newsTemplate,
  slugify,
  type NewsDraft,
  type NewsTemplateKey,
} from '@/lib/studio-templates';

type Page = {
  id: string;
  sectionKey: string;
  title?: string | null;
  contentJson: Record<string, unknown>;
  published: boolean;
};

type Slide = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  imageUrl: string;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  sortOrder: number;
  active: boolean;
};

type News = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  body?: string | null;
  coverUrl?: string | null;
  published: boolean;
  template?: string | null;
  eventDate?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  /** El practicante la mandó a revisión (junta 23-10-2026). */
  reviewRequestedAt?: string | null;
};

/**
 * Propuesta de un practicante sobre una sección del inicio: fila aparte, nunca publicada (la API
 * la guarda así; ver studio.controller.ts · PROPOSAL_SUFFIX).
 */
const PROPOSAL_SUFFIX = '__propuesta';
const isProposal = (p: Page) => p.sectionKey.endsWith(PROPOSAL_SUFFIX);

type NewsForm = NewsDraft & { published: boolean };

const EMPTY_NEWS: NewsForm = {
  slug: '',
  title: '',
  excerpt: '',
  body: '',
  coverUrl: '',
  published: true,
  template: '',
  eventDate: '',
  ctaLabel: '',
  ctaHref: '',
};

/** La noticia guardada, de vuelta al formulario (fecha del show como AAAA-MM-DD). */
function newsToForm(n: News): NewsForm {
  return {
    slug: n.slug,
    title: n.title,
    excerpt: n.excerpt || '',
    body: n.body || '',
    coverUrl: n.coverUrl || '',
    published: n.published,
    template: (newsTemplate(n.template)?.key ?? '') as NewsTemplateKey | '',
    eventDate: n.eventDate ? n.eventDate.slice(0, 10) : '',
    ctaLabel: n.ctaLabel || '',
    ctaHref: n.ctaHref || '',
  };
}

type Tab = 'sections' | 'carousel' | 'news';

const SECTION_META: Record<string, string> = {
  home_hero: 'Hero (textos)',
  home_about: 'Nosotros',
  home_modulos: 'Módulos',
  home_cta: 'Contacto',
};

const STUDIO_TABS: Array<{ key: Tab; label: string }> = [
  { key: 'carousel', label: 'Carrusel' },
  { key: 'news', label: 'Noticias' },
  { key: 'sections', label: 'Secciones' },
];

function msgVariant(msg: string): 'success' | 'error' | 'warn' | 'info' {
  const m = msg.toLowerCase();
  if (m.includes('error')) return 'error';
  if (m.includes('borrador') || m.includes('agrega una imagen')) return 'warn';
  if (
    m.includes('guardad') ||
    m.includes('publicad') ||
    m.includes('agregad') ||
    m.includes('subid')
  ) {
    return 'success';
  }
  return 'info';
}

export default function StudioPage() {
  const { entity, setEntity, user } = useUser();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('carousel');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [sectionKey, setSectionKey] = useState('home_hero');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [published, setPublished] = useState(true);
  const [msg, setMsg] = useState('');
  const [slideForm, setSlideForm] = useState({
    title: '',
    subtitle: '',
    imageUrl: '',
    ctaLabel: 'Ver más',
    ctaHref: '#modulos',
  });
  const [newsForm, setNewsForm] = useState<NewsForm>(EMPTY_NEWS);
  /** Noticia que se está editando en el formulario (null = nueva). */
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editSlideId, setEditSlideId] = useState<string | null>(null);
  const [editSlideDraft, setEditSlideDraft] = useState({
    title: '',
    subtitle: '',
    imageUrl: '',
    ctaLabel: '',
    ctaHref: '',
  });
  const [tileDraft, setTileDraft] = useState<Array<{ title: string; body: string }>>([]);
  const [aboutStatsDraft, setAboutStatsDraft] = useState<Array<{ label: string; text: string }>>([]);
  const [aboutLocation, setAboutLocation] = useState('');

  /**
   * Junta 23-10-2026: el practicante deja borradores (noticias, slides inactivos y propuestas de
   * sección) y dirección publica. La API aplica la misma regla (`canPublishStudio`).
   */
  const canPublish = !!user && canPublishStudio(user.roleKey as RoleKey, user.permissions || []);
  const sectionPages = useMemo(() => pages.filter((p) => !isProposal(p)), [pages]);
  const proposals = useMemo(
    () => new Map(pages.filter(isProposal).map((p) => [p.sectionKey.slice(0, -PROPOSAL_SUFFIX.length), p])),
    [pages],
  );
  const inReview = news.filter((n) => !n.published && n.reviewRequestedAt).length;

  const draftsCount = useMemo(
    () =>
      sectionPages.filter((p) => !p.published).length +
      proposals.size +
      news.filter((n) => !n.published).length +
      slides.filter((s) => !s.active).length,
    [sectionPages, proposals, news, slides],
  );

  const tabCounts: Record<Tab, number> = useMemo(
    () => ({ carousel: slides.length, news: news.length, sections: sectionPages.length }),
    [slides.length, news.length, sectionPages.length],
  );

  // Los avisos de «Enviar a revisión» llegan con ?tab=news|carousel|sections.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    if (wanted === 'news' || wanted === 'carousel' || wanted === 'sections') setTab(wanted);
  }, []);

  async function uploadAsset(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'image');
    const res = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
    return res.url;
  }

  async function load() {
    const [p, s, n] = await Promise.all([
      api<Page[]>('/studio/pages'),
      api<Slide[]>('/studio/slides'),
      api<News[]>('/studio/news?all=1'),
    ]);
    setPages(p);
    setSlides(s);
    setNews(n);
    // El editor se llena en el efecto de abajo (sección o, para el practicante, su propuesta).
    const real = p.filter((x) => !isProposal(x));
    const current = real.find((x) => x.sectionKey === sectionKey) || real[0];
    if (current) setSectionKey(current.sectionKey);
  }

  useEffect(() => {
    if (entity !== 'ARTA') setEntity('ARTA');
  }, [entity, setEntity]);

  useEffect(() => {
    if (!user) return;
    if (!user.entities.includes('ARTA')) {
      router.replace('/dashboard');
      return;
    }
    setLoading(true);
    load()
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /** Llena el editor con una sección (o una propuesta de practicante). */
  function fillSectionDraft(page: Page) {
    const c = page.contentJson || {};
    setDraft({
      brand: String(c.brand || ''),
      brandSub: String(c.brandSub || ''),
      headline: String(c.headline || ''),
      sub: String(c.sub || c.lead || ''),
      body: String(c.body || ''),
      cta: String(c.cta || ''),
      ctaHref: String(c.ctaHref || ''),
      lead: String(c.lead || ''),
    });
    if (sectionKey === 'home_modulos') {
      const tiles = (page.contentJson as { tiles?: Array<{ title: string; body: string }> })?.tiles;
      setTileDraft(
        tiles?.length
          ? tiles.map((t) => ({ title: t.title, body: t.body }))
          : [
              { title: 'Producción', body: 'Riders, plantas de luz, stage hands y minuto a minuto.' },
              { title: 'Hospitality', body: 'Hospedaje, transporte, catering y camerinos.' },
            ],
      );
    }
    if (sectionKey === 'home_about') {
      const c = page.contentJson as {
        stats?: Array<{ label: string; text: string }>;
        location?: string;
      };
      setAboutLocation(String(c.location || ''));
      setAboutStatsDraft(
        c.stats?.length
          ? c.stats.map((s) => ({ label: s.label, text: s.text }))
          : [
              { label: 'Shows', text: 'Producción integral de conciertos' },
              { label: 'Puebla', text: 'Base operativa y venues aliados' },
              { label: 'Experiencia', text: 'Del rider al cierre del evento' },
            ],
      );
    }
  }

  useEffect(() => {
    const real = pages.find((p) => p.sectionKey === sectionKey);
    // El practicante sigue editando su propuesta si ya tiene una; dirección ve la sección publicada.
    const page = (!canPublish && proposals.get(sectionKey)) || real || proposals.get(sectionKey);
    if (!page) return;
    fillSectionDraft(page);
    if (real) setPublished(real.published);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, pages, canPublish]);

  async function saveSection() {
    setMsg('');
    setSaving(true);
    try {
      await api('/studio/pages', {
        method: 'PUT',
        body: JSON.stringify({
          sectionKey,
          title: SECTION_META[sectionKey] || sectionKey,
          // El practicante no manda `published`: la API guarda su versión como propuesta.
          ...(canPublish ? { published } : {}),
          contentJson: {
            brand: draft.brand,
            brandSub: draft.brandSub,
            headline: draft.headline,
            sub: draft.sub,
            lead: draft.lead || draft.sub,
            body: draft.body,
            cta: draft.cta,
            ctaHref: draft.ctaHref || '#contacto',
            ...(sectionKey === 'home_modulos'
              ? { tiles: tileDraft.filter((t) => t.title.trim()) }
              : {}),
            ...(sectionKey === 'home_about'
              ? {
                  stats: aboutStatsDraft.filter((s) => s.label.trim()),
                  location: aboutLocation,
                }
              : {}),
          },
        }),
      });
      setMsg(
        !canPublish
          ? 'Propuesta guardada: la sección publicada no cambia hasta que dirección la revise'
          : published
            ? 'Sección publicada'
            : 'Borrador guardado',
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function addSlide() {
    if (!slideForm.imageUrl) {
      setMsg('Agrega una imagen antes de publicar el slide');
      return;
    }
    setSaving(true);
    try {
      await api('/studio/slides', {
        method: 'POST',
        body: JSON.stringify({ ...slideForm, sortOrder: slides.length, active: canPublish }),
      });
      setSlideForm({ title: '', subtitle: '', imageUrl: '', ctaLabel: 'Ver más', ctaHref: '#modulos' });
      setMsg(canPublish ? 'Slide agregado al carrusel' : 'Slide guardado como borrador: mándalo a revisión cuando esté listo');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function saveSlide(s: Slide, patch: Partial<Slide>) {
    setSaving(true);
    try {
      await api(`/studio/slides/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: patch.title ?? s.title,
          subtitle: patch.subtitle ?? s.subtitle,
          imageUrl: patch.imageUrl ?? s.imageUrl,
          ctaLabel: patch.ctaLabel ?? s.ctaLabel,
          ctaHref: patch.ctaHref ?? s.ctaHref,
          sortOrder: s.sortOrder,
          active: patch.active ?? s.active,
        }),
      });
      setMsg('Slide actualizado');
      setEditSlideId(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function replaceSlideImage(s: Slide, file: File) {
    setUploading(true);
    try {
      const url = await uploadAsset(file);
      await saveSlide(s, { imageUrl: url });
      if (editSlideId === s.id) {
        setEditSlideDraft((d) => ({ ...d, imageUrl: url }));
      }
      setMsg('Imagen reemplazada');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error upload');
    } finally {
      setUploading(false);
    }
  }

  function startEditSlide(s: Slide) {
    setEditSlideId(s.id);
    setEditSlideDraft({
      title: s.title || '',
      subtitle: s.subtitle || '',
      imageUrl: s.imageUrl,
      ctaLabel: s.ctaLabel || '',
      ctaHref: s.ctaHref || '',
    });
  }

  async function toggleSlide(s: Slide) {
    await api(`/studio/slides/${s.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: s.title,
        subtitle: s.subtitle,
        imageUrl: s.imageUrl,
        ctaLabel: s.ctaLabel,
        ctaHref: s.ctaHref,
        sortOrder: s.sortOrder,
        active: !s.active,
      }),
    });
    await load();
  }

  async function removeSlide(id: string) {
    await api(`/studio/slides/${id}`, { method: 'DELETE' });
    await load();
  }

  /** Elegir plantilla: deja el texto guía y el botón sugerido sin pisar lo ya escrito. */
  function pickTemplate(key: NewsTemplateKey | '') {
    const tpl = newsTemplate(key);
    setNewsForm((f) => ({
      ...f,
      template: key,
      body: f.body.trim() || !tpl ? f.body : tpl.bodyStarter,
      ctaLabel: f.ctaLabel.trim() || !tpl ? f.ctaLabel : tpl.cta.label,
      ctaHref: f.ctaHref.trim() || !tpl ? f.ctaHref : tpl.cta.href,
    }));
  }

  function resetNewsForm() {
    setNewsForm({ ...EMPTY_NEWS, published: canPublish });
    setEditingNewsId(null);
  }

  function editNews(n: News) {
    setEditingNewsId(n.id);
    setNewsForm(newsToForm(n));
    setTab('news');
  }

  const publishNews = canPublish && newsForm.published;
  const newsMissing = missingForNews(newsForm);
  const activeTemplate = newsTemplate(newsForm.template);

  async function addNews() {
    if (!newsForm.title || !newsForm.slug) {
      setMsg('Error: la noticia necesita título y slug');
      return;
    }
    if (publishNews && newsMissing.length) {
      setMsg(`Error: para publicar falta ${newsMissing.join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        slug: newsForm.slug,
        title: newsForm.title,
        excerpt: newsForm.excerpt,
        body: newsForm.body,
        coverUrl: newsForm.coverUrl,
        published: publishNews,
        template: newsForm.template || null,
        eventDate: newsForm.eventDate || null,
        ctaLabel: newsForm.ctaLabel || null,
        ctaHref: newsForm.ctaHref || null,
      };
      await api(editingNewsId ? `/studio/news/${editingNewsId}` : '/studio/news', {
        method: editingNewsId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      resetNewsForm();
      setMsg(
        publishNews
          ? 'Noticia publicada'
          : canPublish
            ? 'Borrador de noticia guardado'
            : 'Borrador de noticia guardado: mándalo a revisión cuando esté listo',
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  /** «Enviar a revisión» (practicante): le avisa a quien publica. */
  async function requestReview(kind: 'news' | 'slide' | 'section', id: string) {
    setSaving(true);
    try {
      const res = await api<{ notified: number }>('/studio/review', {
        method: 'POST',
        body: JSON.stringify({ kind, id }),
      });
      setMsg(
        res.notified
          ? `Enviado a revisión: avisamos a ${res.notified} persona${res.notified === 1 ? '' : 's'} de dirección`
          : 'Enviado a revisión',
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function discardProposal(key: string) {
    if (!confirm('¿Descartar la propuesta del practicante para esta sección?')) return;
    try {
      await api(`/studio/pages/${key}/proposal`, { method: 'DELETE' });
      setMsg('Propuesta descartada');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  }

  async function toggleNews(n: News) {
    try {
      await api(`/studio/news/${n.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          slug: n.slug,
          title: n.title,
          excerpt: n.excerpt,
          body: n.body,
          coverUrl: n.coverUrl,
          published: !n.published,
        }),
      });
      setMsg(n.published ? 'Noticia regresada a borrador' : 'Noticia publicada');
      await load();
    } catch (e) {
      // P. ej. un «Evento destacado» sin fecha del show no se publica.
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  }

  async function removeNews(id: string) {
    await api(`/studio/news/${id}`, { method: 'DELETE' });
    await load();
  }

  const previewHeadline = draft.headline || 'Titular del sitio';
  const previewBody = draft.body || draft.sub || 'Texto de apoyo editable en Studio.';
  const previewCta = draft.cta || 'Botón';

  return (
    <AppShell title="Studio · Sitio Arta">
      <div className="stack page-workspace">
        <PageHeader
          title="Studio"
          description={
            canPublish
              ? 'Carrusel, noticias y secciones del sitio público de Arta. Guarda como borrador o publica.'
              : 'Carrusel, noticias y secciones del sitio de Arta. Lo tuyo queda como borrador: mándalo a revisión y dirección lo publica.'
          }
        >
          <Link className="btn" href="/p/arta" target="_blank" rel="noopener noreferrer">
            Ver sitio live
          </Link>
          <ActionLink href="/site" variant="ghost">
            Vista previa
          </ActionLink>
        </PageHeader>

        {loading ? (
          <>
            <LoadingKpis count={4} />
            <LoadingBlock rows={5} label="Cargando Studio…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <div className="kpi">
                <div className="label">Secciones</div>
                <div className="value">{sectionPages.length}</div>
                <div className="kpi-sub muted">{sectionPages.filter((p) => p.published).length} publicadas</div>
              </div>
              <div className="kpi">
                <div className="label">Slides</div>
                <div className="value">{slides.length}</div>
                <div className="kpi-sub muted">{slides.filter((s) => s.active).length} activos</div>
              </div>
              <div className="kpi">
                <div className="label">Noticias</div>
                <div className="value">{news.length}</div>
                <div className="kpi-sub muted">{news.filter((n) => n.published).length} publicadas</div>
              </div>
              <div className={`kpi ${draftsCount ? 'kpi--danger' : ''}`}>
                <div className="label">Borradores</div>
                <div className="value">{draftsCount}</div>
                <div className="kpi-sub muted">
                  {inReview || proposals.size
                    ? `${inReview + proposals.size} en revisión · incluye slides inactivos`
                    : 'Incluye slides inactivos'}
                </div>
              </div>
            </div>

            <FilterBar
              meta={
                draftsCount
                  ? `${draftsCount} elemento${draftsCount === 1 ? '' : 's'} en borrador`
                  : 'Todo publicado'
              }
            >
              <nav className="tab-bar" aria-label="Studio">
                {STUDIO_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={`tab-bar__btn ${tab === key ? 'is-active' : ''}`}
                    onClick={() => setTab(key)}
                  >
                    {label}
                    <span className="tab-bar__count">{tabCounts[key]}</span>
                  </button>
                ))}
              </nav>
            </FilterBar>

            {msg ? (
              <FlashMessage variant={msgVariant(msg)} onDismiss={() => setMsg('')}>
                {msg}
              </FlashMessage>
            ) : null}

            {tab === 'carousel' && (
              <div className="dash-split">
                <div className="panel">
                  <div className="panel-head">
                    <h2>Nuevo slide</h2>
                  </div>
                  <div className="panel-body">
                    <div className="form">
                      <label>
                        URL de imagen (pantalla completa)
                        <input
                          value={slideForm.imageUrl}
                          onChange={(e) => setSlideForm({ ...slideForm, imageUrl: e.target.value })}
                          placeholder="https://… o sube abajo"
                        />
                      </label>
                      {slideForm.imageUrl ? (
                        <img
                          className="studio-preview__thumb"
                          src={slideForm.imageUrl}
                          alt="Vista previa del slide"
                        />
                      ) : null}
                      <label className="btn ghost">
                        {uploading ? 'Subiendo…' : 'Subir imagen'}
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setUploading(true);
                            try {
                              const url = await uploadAsset(f);
                              setSlideForm((s) => ({ ...s, imageUrl: url }));
                              setMsg('Imagen subida');
                            } catch (err) {
                              setMsg(err instanceof Error ? err.message : 'Error upload');
                            } finally {
                              setUploading(false);
                            }
                          }}
                        />
                      </label>
                      <FormGrid>
                        <label>
                          Título
                          <input
                            value={slideForm.title}
                            onChange={(e) => setSlideForm({ ...slideForm, title: e.target.value })}
                          />
                        </label>
                        <label>
                          Subtítulo
                          <input
                            value={slideForm.subtitle}
                            onChange={(e) => setSlideForm({ ...slideForm, subtitle: e.target.value })}
                          />
                        </label>
                      </FormGrid>
                      <FormGrid>
                        <label>
                          Botón
                          <input
                            value={slideForm.ctaLabel}
                            onChange={(e) => setSlideForm({ ...slideForm, ctaLabel: e.target.value })}
                          />
                        </label>
                        <label>
                          Enlace del botón
                          <input
                            value={slideForm.ctaHref}
                            onChange={(e) => setSlideForm({ ...slideForm, ctaHref: e.target.value })}
                          />
                        </label>
                      </FormGrid>
                      <button className="btn" type="button" disabled={saving} onClick={addSlide}>
                        {saving ? 'Guardando…' : canPublish ? 'Agregar al carrusel' : 'Guardar como borrador'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h2>Carrusel · {slides.length}</h2>
                  </div>
                  <div className="panel-body">
                    {!slides.length ? (
                      <EmptyState
                        title="Carrusel vacío"
                        description="Sube una imagen a pantalla completa y define título + botón."
                        steps={['Sube o pega URL', 'Título / subtítulo', 'Agregar al carrusel']}
                      />
                    ) : (
                      <div className="studio-slide-grid">
                        {slides.map((s) => {
                          const editing = editSlideId === s.id;
                          // Un slide activo está en el sitio: el practicante no lo cambia.
                          const locked = !canPublish && s.active;
                          return (
                          <div className={`studio-slide-card ${s.active ? '' : 'is-off'}`} key={s.id}>
                            <div className="studio-slide-card__media">
                              <img src={s.imageUrl} alt={s.title || 'Slide del carrusel'} />
                              <div className="studio-slide-card__media-actions">
                                {locked ? null : (
                                  <label className="btn ghost btn-sm">
                                    {uploading ? 'Subiendo…' : 'Cambiar imagen'}
                                    <input
                                      type="file"
                                      hidden
                                      accept="image/*"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void replaceSlideImage(s, f);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                )}
                                {!editing && !locked ? (
                                  <button
                                    className="btn ghost btn-sm"
                                    type="button"
                                    onClick={() => startEditSlide(s)}
                                  >
                                    Editar
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            <div className="studio-slide-card__body">
                              {editing ? (
                                <div className="form studio-slide-card__edit">
                                  <FormGrid>
                                    <label>
                                      Título
                                      <input
                                        value={editSlideDraft.title}
                                        onChange={(e) =>
                                          setEditSlideDraft({ ...editSlideDraft, title: e.target.value })
                                        }
                                      />
                                    </label>
                                    <label>
                                      Subtítulo
                                      <input
                                        value={editSlideDraft.subtitle}
                                        onChange={(e) =>
                                          setEditSlideDraft({ ...editSlideDraft, subtitle: e.target.value })
                                        }
                                      />
                                    </label>
                                  </FormGrid>
                                  <FormGrid>
                                    <label>
                                      Botón
                                      <input
                                        value={editSlideDraft.ctaLabel}
                                        onChange={(e) =>
                                          setEditSlideDraft({ ...editSlideDraft, ctaLabel: e.target.value })
                                        }
                                      />
                                    </label>
                                    <label>
                                      Enlace del botón
                                      <input
                                        value={editSlideDraft.ctaHref}
                                        onChange={(e) =>
                                          setEditSlideDraft({ ...editSlideDraft, ctaHref: e.target.value })
                                        }
                                      />
                                    </label>
                                  </FormGrid>
                                  <label>
                                    URL de imagen
                                    <input
                                      value={editSlideDraft.imageUrl}
                                      onChange={(e) =>
                                        setEditSlideDraft({ ...editSlideDraft, imageUrl: e.target.value })
                                      }
                                    />
                                  </label>
                                  <div className="form-actions">
                                    <button
                                      className="btn"
                                      type="button"
                                      disabled={saving || !editSlideDraft.imageUrl}
                                      onClick={() =>
                                        saveSlide(s, {
                                          title: editSlideDraft.title,
                                          subtitle: editSlideDraft.subtitle,
                                          imageUrl: editSlideDraft.imageUrl,
                                          ctaLabel: editSlideDraft.ctaLabel,
                                          ctaHref: editSlideDraft.ctaHref,
                                        })
                                      }
                                    >
                                      {saving ? 'Guardando…' : 'Guardar cambios'}
                                    </button>
                                    <button
                                      className="btn ghost"
                                      type="button"
                                      onClick={() => setEditSlideId(null)}
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="row">
                                    <strong>{s.title || 'Sin título'}</strong>
                                    <span className={`badge ${s.active ? 'ok' : 'warn'}`}>
                                      {s.active ? 'Activo' : 'Borrador'}
                                    </span>
                                  </div>
                                  <div className="kpi-sub muted">{s.subtitle || '—'}</div>
                                  <div className="kpi-sub muted">
                                    {s.ctaLabel || 'Botón'} → {s.ctaHref || '#'}
                                  </div>
                                  <div className="row row--tight">
                                    {canPublish ? (
                                      <button className="btn ghost btn-sm" type="button" onClick={() => toggleSlide(s)}>
                                        {s.active ? 'Desactivar' : 'Activar'}
                                      </button>
                                    ) : !s.active ? (
                                      <button
                                        className="btn ghost btn-sm"
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void requestReview('slide', s.id)}
                                      >
                                        Enviar a revisión
                                      </button>
                                    ) : null}
                                    {locked ? null : (
                                      <button
                                        className="btn ghost btn-sm btn-danger"
                                        type="button"
                                        onClick={() => removeSlide(s.id)}
                                      >
                                        Eliminar
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === 'news' && (
              <div className="dash-split">
                <div className="panel">
                  <div className="panel-head">
                    <h2>{editingNewsId ? 'Editar noticia' : 'Nueva noticia'}</h2>
                    {editingNewsId ? (
                      <button className="btn ghost btn-sm" type="button" onClick={resetNewsForm}>
                        Nueva en blanco
                      </button>
                    ) : null}
                  </div>
                  <div className="panel-body">
                    <div className="form">
                      {/* Junta 23-10-2026: plantillas de página para las publicaciones de redes. */}
                      <div className="stack">
                        <div className="label">Plantilla</div>
                        <div className="row row--tight" role="radiogroup" aria-label="Plantilla de la publicación">
                          {[...NEWS_TEMPLATES, null].map((tpl) => {
                            const key = tpl?.key ?? '';
                            const active = newsForm.template === key;
                            return (
                              <button
                                key={key || 'libre'}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={`btn btn-sm ${active ? '' : 'ghost'}`}
                                onClick={() => pickTemplate(key)}
                                title={tpl?.description ?? 'Sin guía: título, texto y portada'}
                              >
                                {tpl?.label ?? 'Libre'}
                              </button>
                            );
                          })}
                        </div>
                        {activeTemplate ? <p className="kpi-sub muted">{activeTemplate.description}</p> : null}
                      </div>
                      <FormGrid>
                        <label>
                          Título
                          <input
                            value={newsForm.title}
                            placeholder={activeTemplate?.hints.title}
                            onChange={(e) =>
                              setNewsForm({
                                ...newsForm,
                                title: e.target.value,
                                slug: newsForm.slug || slugify(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Slug
                          <input
                            value={newsForm.slug}
                            onChange={(e) => setNewsForm({ ...newsForm, slug: e.target.value })}
                          />
                        </label>
                      </FormGrid>
                      {activeTemplate?.requiresEventDate ? (
                        <label>
                          Fecha del show
                          <input
                            type="date"
                            value={newsForm.eventDate}
                            onChange={(e) => setNewsForm({ ...newsForm, eventDate: e.target.value })}
                          />
                        </label>
                      ) : null}
                      <label>
                        {activeTemplate ? 'Entrada (se ve en la tarjeta y al compartir)' : 'Extracto'}
                        <textarea
                          rows={2}
                          placeholder={activeTemplate?.hints.excerpt}
                          value={newsForm.excerpt}
                          onChange={(e) => setNewsForm({ ...newsForm, excerpt: e.target.value })}
                        />
                      </label>
                      <label>
                        Cuerpo
                        <textarea
                          rows={activeTemplate ? 7 : 5}
                          placeholder={activeTemplate?.hints.body}
                          value={newsForm.body}
                          onChange={(e) => setNewsForm({ ...newsForm, body: e.target.value })}
                        />
                      </label>
                      <label>
                        Cover URL
                        <input
                          value={newsForm.coverUrl}
                          onChange={(e) => setNewsForm({ ...newsForm, coverUrl: e.target.value })}
                        />
                      </label>
                      <label className="btn ghost">
                        {uploading ? 'Subiendo…' : 'Subir cover'}
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setUploading(true);
                            try {
                              const url = await uploadAsset(f);
                              setNewsForm((n) => ({ ...n, coverUrl: url }));
                              setMsg('Cover subido');
                            } catch (err) {
                              setMsg(err instanceof Error ? err.message : 'Error upload');
                            } finally {
                              setUploading(false);
                            }
                          }}
                        />
                      </label>
                      <FormGrid>
                        <label>
                          Botón (opcional)
                          <input
                            value={newsForm.ctaLabel}
                            placeholder={activeTemplate?.cta.label || 'Ej. Comprar boletos'}
                            onChange={(e) => setNewsForm({ ...newsForm, ctaLabel: e.target.value })}
                          />
                        </label>
                        <label>
                          Enlace del botón
                          <input
                            value={newsForm.ctaHref}
                            placeholder="https://… o #contacto"
                            onChange={(e) => setNewsForm({ ...newsForm, ctaHref: e.target.value })}
                          />
                        </label>
                      </FormGrid>
                      {newsForm.title || newsForm.coverUrl ? (
                        <div className="studio-preview__stage" aria-label="Vista previa de la publicación">
                          {newsForm.coverUrl ? (
                            <img className="studio-preview__thumb" src={newsForm.coverUrl} alt="Portada" />
                          ) : null}
                          {newsForm.eventDate ? (
                            <div className="kpi-sub muted">{eventDateLabel(newsForm.eventDate)}</div>
                          ) : null}
                          <h3 className="studio-preview__headline">{newsForm.title || 'Título'}</h3>
                          {newsForm.excerpt ? <p className="studio-preview__body">{newsForm.excerpt}</p> : null}
                          {newsForm.ctaLabel ? <span className="studio-preview__cta">{newsForm.ctaLabel}</span> : null}
                        </div>
                      ) : null}
                      {newsMissing.length && (newsForm.title || newsForm.template) ? (
                        <p className="kpi-sub muted">Para publicar falta: {newsMissing.join(', ')}.</p>
                      ) : null}
                      {canPublish ? (
                        <FieldCheck
                          checked={newsForm.published}
                          onChange={(checked) => setNewsForm({ ...newsForm, published: checked })}
                          label={editingNewsId ? 'Publicada en el sitio' : 'Publicar al crear'}
                        />
                      ) : null}
                      <button className="btn" type="button" disabled={saving} onClick={addNews}>
                        {saving ? 'Guardando…' : publishNews ? 'Publicar noticia' : 'Guardar borrador'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h2>Directorio · {news.length}</h2>
                  </div>
                  <div className="panel-body">
                    {!news.length ? (
                      <EmptyState
                        title="Sin noticias"
                        description="Crea la primera nota para el sitio público."
                      />
                    ) : (
                      <div className="table-wrap">
                        <table className="table table-sticky">
                          <thead>
                            <tr>
                              <th>Título</th>
                              <th>Slug</th>
                              <th>Estado</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {news.map((n) => (
                              <tr key={n.id}>
                                <td>
                                  <strong>{n.title}</strong>
                                  {n.excerpt ? (
                                    <div className="kpi-sub muted">
                                      {n.excerpt.slice(0, 80)}
                                      {n.excerpt.length > 80 ? '…' : ''}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="muted">{n.slug}</td>
                                <td>
                                  <span className={`badge ${n.published ? 'ok' : 'warn'}`}>
                                    {n.published ? 'Publicada' : n.reviewRequestedAt ? 'En revisión' : 'Borrador'}
                                  </span>
                                  {newsTemplate(n.template) ? (
                                    <div className="kpi-sub muted">{newsTemplate(n.template)?.label}</div>
                                  ) : null}
                                </td>
                                <td>
                                  <div className="row">
                                    {canPublish || !n.published ? (
                                      <button className="btn ghost" type="button" onClick={() => editNews(n)}>
                                        Editar
                                      </button>
                                    ) : null}
                                    {canPublish ? (
                                      <button className="btn ghost" type="button" onClick={() => toggleNews(n)}>
                                        {n.published ? 'Despublicar' : 'Publicar'}
                                      </button>
                                    ) : !n.published && !n.reviewRequestedAt ? (
                                      <button
                                        className="btn ghost"
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void requestReview('news', n.id)}
                                      >
                                        Enviar a revisión
                                      </button>
                                    ) : null}
                                    {n.published ? (
                                      <Link className="btn ghost" href={`/p/arta/noticias/${n.slug}`} target="_blank">
                                        Ver
                                      </Link>
                                    ) : null}
                                    {canPublish || !n.published ? (
                                      <button className="btn ghost" type="button" onClick={() => removeNews(n.id)}>
                                        Eliminar
                                      </button>
                                    ) : null}
                                  </div>
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
            )}

            {tab === 'sections' && (
              <div className="stack">
                <FilterBar
                  meta={
                    proposals.has(sectionKey) ? (
                      <span className="badge warn">Propuesta en revisión</span>
                    ) : (
                      <span className={`badge ${published ? 'ok' : 'warn'}`}>
                        {published ? 'Publicado' : 'Borrador'}
                      </span>
                    )
                  }
                >
                  <nav className="tab-bar" aria-label="Secciones del home">
                    {Object.keys(SECTION_META).map((key) => {
                      const page = pages.find((p) => p.sectionKey === key);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`tab-bar__btn ${sectionKey === key ? 'is-active' : ''}`}
                          onClick={() => setSectionKey(key)}
                        >
                          {SECTION_META[key]}
                          {proposals.has(key) ? (
                            <span className="tab-bar__count">propuesta</span>
                          ) : page ? (
                            <span className="tab-bar__count">{page.published ? 'on' : 'off'}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </nav>
                </FilterBar>

                {canPublish && proposals.has(sectionKey) ? (
                  <FlashMessage variant="warn">
                    Un practicante propuso cambios a esta sección.{' '}
                    <button
                      className="btn ghost btn-sm"
                      type="button"
                      onClick={() => {
                        const proposal = proposals.get(sectionKey);
                        if (proposal) fillSectionDraft(proposal);
                        setMsg('Propuesta cargada en el editor: revísala y guarda para publicarla');
                      }}
                    >
                      Cargar propuesta
                    </button>{' '}
                    <button className="btn ghost btn-sm btn-danger" type="button" onClick={() => void discardProposal(sectionKey)}>
                      Descartar
                    </button>
                  </FlashMessage>
                ) : null}
                {!canPublish ? (
                  <FlashMessage variant="info">
                    Tus cambios se guardan como propuesta: la sección del sitio no cambia hasta que dirección la revise.
                    {proposals.has(sectionKey) ? (
                      <>
                        {' '}
                        <button
                          className="btn ghost btn-sm"
                          type="button"
                          disabled={saving}
                          onClick={() => void requestReview('section', sectionKey)}
                        >
                          Enviar a revisión
                        </button>
                      </>
                    ) : null}
                  </FlashMessage>
                ) : null}

                <div className="studio-split">
                  <div className="panel">
                    <div className="panel-head">
                      <h2>Editor · {SECTION_META[sectionKey]}</h2>
                    </div>
                    <div className="panel-body">
                      <div className="form">
                        {sectionKey === 'home_hero' ? (
                          <FormGrid>
                            <label>
                              Marca
                              <input
                                value={draft.brand || ''}
                                onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                              />
                            </label>
                            <label>
                              Submarca
                              <input
                                value={draft.brandSub || ''}
                                onChange={(e) => setDraft({ ...draft, brandSub: e.target.value })}
                              />
                            </label>
                          </FormGrid>
                        ) : null}
                        <label>
                          Titular
                          <input
                            value={draft.headline || ''}
                            onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
                          />
                        </label>
                        <label>
                          Texto
                          <textarea
                            rows={5}
                            value={draft.body || draft.sub || ''}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                body: e.target.value,
                                sub: e.target.value,
                                lead: e.target.value,
                              })
                            }
                          />
                        </label>
                        <FormGrid>
                          <label>
                            Botón
                            <input
                              value={draft.cta || ''}
                              onChange={(e) => setDraft({ ...draft, cta: e.target.value })}
                            />
                          </label>
                          <label>
                            Enlace del botón
                            <input
                              value={draft.ctaHref || ''}
                              onChange={(e) => setDraft({ ...draft, ctaHref: e.target.value })}
                            />
                          </label>
                        </FormGrid>
                        {sectionKey === 'home_modulos' ? (
                          <div className="stack" style={{ marginTop: '1rem' }}>
                            <div className="label">Tiles del home (módulos)</div>
                            {tileDraft.map((tile, idx) => (
                              <div key={idx} className="panel" style={{ padding: '0.75rem' }}>
                                <FormGrid>
                                  <label>
                                    Título
                                    <input
                                      value={tile.title}
                                      onChange={(e) => {
                                        const next = [...tileDraft];
                                        next[idx] = { ...tile, title: e.target.value };
                                        setTileDraft(next);
                                      }}
                                    />
                                  </label>
                                  <label>
                                    &nbsp;
                                    <button
                                      className="btn ghost btn-sm btn-danger"
                                      type="button"
                                      onClick={() => setTileDraft(tileDraft.filter((_, i) => i !== idx))}
                                    >
                                      Quitar
                                    </button>
                                  </label>
                                </FormGrid>
                                <label>
                                  Texto
                                  <textarea
                                    rows={2}
                                    value={tile.body}
                                    onChange={(e) => {
                                      const next = [...tileDraft];
                                      next[idx] = { ...tile, body: e.target.value };
                                      setTileDraft(next);
                                    }}
                                  />
                                </label>
                              </div>
                            ))}
                            <button
                              className="btn ghost btn-sm"
                              type="button"
                              onClick={() =>
                                setTileDraft([...tileDraft, { title: '', body: '' }])
                              }
                            >
                              + Agregar tile
                            </button>
                          </div>
                        ) : null}
                        {sectionKey === 'home_about' ? (
                          <div className="stack" style={{ marginTop: '1rem' }}>
                            <label>
                              Ubicación (texto visible)
                              <textarea
                                rows={3}
                                value={aboutLocation}
                                onChange={(e) => setAboutLocation(e.target.value)}
                                placeholder="Base operativa en Puebla…"
                              />
                            </label>
                            <p className="muted kpi-sub">
                              Coordenadas del mapa: env{' '}
                              <code>NEXT_PUBLIC_VENUE_LAT</code> / <code>NEXT_PUBLIC_VENUE_LNG</code> /{' '}
                              <code>NEXT_PUBLIC_VENUE_ADDRESS</code>.
                            </p>
                            <div className="label">Stats (Nosotros)</div>
                            {aboutStatsDraft.map((stat, idx) => (
                              <div key={idx} className="panel" style={{ padding: '0.75rem' }}>
                                <FormGrid>
                                  <label>
                                    Etiqueta
                                    <input
                                      value={stat.label}
                                      onChange={(e) => {
                                        const next = [...aboutStatsDraft];
                                        next[idx] = { ...stat, label: e.target.value };
                                        setAboutStatsDraft(next);
                                      }}
                                    />
                                  </label>
                                  <label>
                                    &nbsp;
                                    <button
                                      className="btn ghost btn-sm btn-danger"
                                      type="button"
                                      onClick={() =>
                                        setAboutStatsDraft(aboutStatsDraft.filter((_, i) => i !== idx))
                                      }
                                    >
                                      Quitar
                                    </button>
                                  </label>
                                </FormGrid>
                                <label>
                                  Texto
                                  <input
                                    value={stat.text}
                                    onChange={(e) => {
                                      const next = [...aboutStatsDraft];
                                      next[idx] = { ...stat, text: e.target.value };
                                      setAboutStatsDraft(next);
                                    }}
                                  />
                                </label>
                              </div>
                            ))}
                            <button
                              className="btn ghost btn-sm"
                              type="button"
                              onClick={() =>
                                setAboutStatsDraft([...aboutStatsDraft, { label: '', text: '' }])
                              }
                            >
                              + Agregar stat
                            </button>
                          </div>
                        ) : null}
                        {canPublish ? (
                          <FieldCheck
                            checked={published}
                            onChange={setPublished}
                            label="Publicado en sitio live"
                          />
                        ) : null}
                        <button className="btn" type="button" disabled={saving} onClick={saveSection}>
                          {saving
                            ? 'Guardando…'
                            : !canPublish
                              ? 'Guardar propuesta'
                              : published
                                ? 'Guardar y publicar'
                                : 'Guardar borrador'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="panel studio-preview">
                    <div className="panel-head">
                      <h2>Vista previa</h2>
                      <span className="kpi-sub muted">No publicado hasta guardar</span>
                    </div>
                    <div className="panel-body">
                      <div className="studio-preview__stage">
                        {draft.brand ? (
                          <div className="studio-preview__brand">
                            {draft.brand}
                            {draft.brandSub ? <span>{draft.brandSub}</span> : null}
                          </div>
                        ) : null}
                        <h3 className="studio-preview__headline">{previewHeadline}</h3>
                        <p className="studio-preview__body">{previewBody}</p>
                        {previewCta ? (
                          <span className="studio-preview__cta">{previewCta}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
