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
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

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
};

type Tab = 'sections' | 'carousel' | 'news';

const SECTION_META: Record<string, string> = {
  home_hero: 'Hero (textos)',
  home_about: 'Nosotros',
  home_modulos: 'Módulos',
  home_cta: 'CTA / contacto',
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
  const [newsForm, setNewsForm] = useState({
    slug: '',
    title: '',
    excerpt: '',
    body: '',
    coverUrl: '',
    published: true,
  });
  const [uploading, setUploading] = useState(false);

  const draftsCount = useMemo(
    () =>
      pages.filter((p) => !p.published).length +
      news.filter((n) => !n.published).length +
      slides.filter((s) => !s.active).length,
    [pages, news, slides],
  );

  const tabCounts: Record<Tab, number> = useMemo(
    () => ({ carousel: slides.length, news: news.length, sections: pages.length }),
    [slides.length, news.length, pages.length],
  );

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
    const current = p.find((x) => x.sectionKey === sectionKey) || p[0];
    if (current) {
      setSectionKey(current.sectionKey);
      const c = current.contentJson || {};
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
      setPublished(current.published);
    }
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

  useEffect(() => {
    const page = pages.find((p) => p.sectionKey === sectionKey);
    if (!page) return;
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
    setPublished(page.published);
  }, [sectionKey, pages]);

  async function saveSection() {
    setMsg('');
    setSaving(true);
    try {
      await api('/studio/pages', {
        method: 'PUT',
        body: JSON.stringify({
          sectionKey,
          title: SECTION_META[sectionKey] || sectionKey,
          published,
          contentJson: {
            brand: draft.brand,
            brandSub: draft.brandSub,
            headline: draft.headline,
            sub: draft.sub,
            lead: draft.lead || draft.sub,
            body: draft.body,
            cta: draft.cta,
            ctaHref: draft.ctaHref || '#contacto',
            tiles: (pages.find((p) => p.sectionKey === 'home_modulos')?.contentJson as { tiles?: unknown })
              ?.tiles,
          },
        }),
      });
      setMsg(published ? 'Sección publicada' : 'Borrador guardado');
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
        body: JSON.stringify({ ...slideForm, sortOrder: slides.length, active: true }),
      });
      setSlideForm({ title: '', subtitle: '', imageUrl: '', ctaLabel: 'Ver más', ctaHref: '#modulos' });
      setMsg('Slide agregado al carrusel');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
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

  async function addNews() {
    if (!newsForm.title || !newsForm.slug) return;
    setSaving(true);
    try {
      await api('/studio/news', {
        method: 'POST',
        body: JSON.stringify(newsForm),
      });
      setNewsForm({ slug: '', title: '', excerpt: '', body: '', coverUrl: '', published: true });
      setMsg(newsForm.published ? 'Noticia publicada' : 'Borrador de noticia guardado');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleNews(n: News) {
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
    await load();
  }

  async function removeNews(id: string) {
    await api(`/studio/news/${id}`, { method: 'DELETE' });
    await load();
  }

  const previewHeadline = draft.headline || 'Headline del sitio';
  const previewBody = draft.body || draft.sub || 'Texto de apoyo editable en Studio.';
  const previewCta = draft.cta || 'CTA';

  return (
    <AppShell title="Studio · Sitio Arta">
      <div className="stack page-workspace">
        <PageHeader
          description="CMS del sitio público arta PRODUCCIONES. Preview en vivo, publicar / borrador y enlace permanente al site."
        >
          <Link className="btn" href="/p/arta" target="_blank" rel="noopener noreferrer">
            Ver sitio live
          </Link>
          <ActionLink href="/site" variant="ghost">
            Guía sitio
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
                <div className="value">{pages.length}</div>
                <div className="kpi-sub muted">{pages.filter((p) => p.published).length} publicadas</div>
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
                <div className="label">Off / borradores</div>
                <div className="value">{draftsCount}</div>
                <div className="kpi-sub muted">Incluye slides inactivos</div>
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
                        URL de imagen (full-bleed)
                        <input
                          value={slideForm.imageUrl}
                          onChange={(e) => setSlideForm({ ...slideForm, imageUrl: e.target.value })}
                          placeholder="https://… o sube abajo"
                        />
                      </label>
                      {slideForm.imageUrl ? (
                        <div
                          className="studio-preview__thumb"
                          style={{ backgroundImage: `url(${slideForm.imageUrl})` }}
                          aria-hidden
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
                          CTA
                          <input
                            value={slideForm.ctaLabel}
                            onChange={(e) => setSlideForm({ ...slideForm, ctaLabel: e.target.value })}
                          />
                        </label>
                        <label>
                          CTA link
                          <input
                            value={slideForm.ctaHref}
                            onChange={(e) => setSlideForm({ ...slideForm, ctaHref: e.target.value })}
                          />
                        </label>
                      </FormGrid>
                      <button className="btn" type="button" disabled={saving} onClick={addSlide}>
                        {saving ? 'Guardando…' : 'Agregar al carrusel'}
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
                        description="Sube una imagen full-bleed y define título + CTA."
                        steps={['Sube o pega URL', 'Título / subtítulo', 'Agregar al carrusel']}
                      />
                    ) : (
                      <div className="studio-slide-grid">
                        {slides.map((s) => (
                          <div className={`studio-slide-card ${s.active ? '' : 'is-off'}`} key={s.id}>
                            <div
                              className="studio-slide-card__media"
                              style={{ backgroundImage: `url(${s.imageUrl})` }}
                            />
                            <div className="studio-slide-card__body">
                              <div className="row">
                                <strong>{s.title || 'Sin título'}</strong>
                                <span className={`badge ${s.active ? 'ok' : 'warn'}`}>
                                  {s.active ? 'Activo' : 'Off'}
                                </span>
                              </div>
                              <div className="kpi-sub muted">{s.subtitle || '—'}</div>
                              <div className="row">
                                <button className="btn ghost" type="button" onClick={() => toggleSlide(s)}>
                                  {s.active ? 'Desactivar' : 'Activar'}
                                </button>
                                <button className="btn ghost" type="button" onClick={() => removeSlide(s.id)}>
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
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
                    <h2>Nueva noticia</h2>
                  </div>
                  <div className="panel-body">
                    <div className="form">
                      <FormGrid>
                        <label>
                          Título
                          <input
                            value={newsForm.title}
                            onChange={(e) =>
                              setNewsForm({
                                ...newsForm,
                                title: e.target.value,
                                slug:
                                  newsForm.slug ||
                                  e.target.value
                                    .toLowerCase()
                                    .normalize('NFD')
                                    .replace(/[\u0300-\u036f]/g, '')
                                    .replace(/[^a-z0-9]+/g, '-')
                                    .replace(/(^-|-$)/g, ''),
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
                      <label>
                        Extracto
                        <textarea
                          rows={2}
                          value={newsForm.excerpt}
                          onChange={(e) => setNewsForm({ ...newsForm, excerpt: e.target.value })}
                        />
                      </label>
                      <label>
                        Cuerpo
                        <textarea
                          rows={5}
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
                      <FieldCheck
                        checked={newsForm.published}
                        onChange={(checked) => setNewsForm({ ...newsForm, published: checked })}
                        label="Publicar al crear"
                      />
                      <button className="btn" type="button" disabled={saving} onClick={addNews}>
                        {saving ? 'Guardando…' : newsForm.published ? 'Publicar noticia' : 'Guardar borrador'}
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
                                    {n.published ? 'Publicada' : 'Borrador'}
                                  </span>
                                </td>
                                <td>
                                  <div className="row">
                                    <button className="btn ghost" type="button" onClick={() => toggleNews(n)}>
                                      {n.published ? 'Despublicar' : 'Publicar'}
                                    </button>
                                    {n.published ? (
                                      <Link className="btn ghost" href={`/p/arta/noticias/${n.slug}`} target="_blank">
                                        Ver
                                      </Link>
                                    ) : null}
                                    <button className="btn ghost" type="button" onClick={() => removeNews(n.id)}>
                                      Eliminar
                                    </button>
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
                    <span className={`badge ${published ? 'ok' : 'warn'}`}>
                      {published ? 'Publicado' : 'Borrador'}
                    </span>
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
                          {page ? (
                            <span className="tab-bar__count">{page.published ? 'on' : 'off'}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </nav>
                </FilterBar>

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
                              Brand
                              <input
                                value={draft.brand || ''}
                                onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                              />
                            </label>
                            <label>
                              Brand sub
                              <input
                                value={draft.brandSub || ''}
                                onChange={(e) => setDraft({ ...draft, brandSub: e.target.value })}
                              />
                            </label>
                          </FormGrid>
                        ) : null}
                        <label>
                          Headline
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
                            CTA
                            <input
                              value={draft.cta || ''}
                              onChange={(e) => setDraft({ ...draft, cta: e.target.value })}
                            />
                          </label>
                          <label>
                            CTA href
                            <input
                              value={draft.ctaHref || ''}
                              onChange={(e) => setDraft({ ...draft, ctaHref: e.target.value })}
                            />
                          </label>
                        </FormGrid>
                        <FieldCheck
                          checked={published}
                          onChange={setPublished}
                          label="Publicado en sitio live"
                        />
                        <button className="btn" type="button" disabled={saving} onClick={saveSection}>
                          {saving ? 'Guardando…' : published ? 'Guardar y publicar' : 'Guardar borrador'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="panel studio-preview">
                    <div className="panel-head">
                      <h2>Preview</h2>
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
