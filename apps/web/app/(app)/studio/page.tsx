'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
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

export default function StudioPage() {
  const { entity, setEntity, user } = useUser();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('carousel');
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
    load().catch(console.error);
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
      setMsg('Sección guardada');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  }

  async function addSlide() {
    if (!slideForm.imageUrl) return;
    await api('/studio/slides', {
      method: 'POST',
      body: JSON.stringify({ ...slideForm, sortOrder: slides.length, active: true }),
    });
    setSlideForm({ title: '', subtitle: '', imageUrl: '', ctaLabel: 'Ver más', ctaHref: '#modulos' });
    setMsg('Slide agregado al carrusel');
    await load();
  }

  async function removeSlide(id: string) {
    await api(`/studio/slides/${id}`, { method: 'DELETE' });
    await load();
  }

  async function addNews() {
    if (!newsForm.title || !newsForm.slug) return;
    await api('/studio/news', {
      method: 'POST',
      body: JSON.stringify(newsForm),
    });
    setNewsForm({ slug: '', title: '', excerpt: '', body: '', coverUrl: '', published: true });
    setMsg('Noticia publicada');
    await load();
  }

  async function removeNews(id: string) {
    await api(`/studio/news/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <AppShell title="Studio · Sitio Arta">
      <div className="stack">
        <p className="muted">
          Único sitio público: <strong>arta PRODUCCIONES</strong>. Edita carrusel, noticias y secciones.
        </p>
        <div className="row">
          {(
            [
              ['carousel', 'Carrusel'],
              ['news', 'Noticias'],
              ['sections', 'Secciones'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`btn ${tab === k ? '' : 'ghost'}`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
          <Link className="btn ghost" href="/p/arta" style={{ marginLeft: 'auto' }}>
            Ver sitio Arta
          </Link>
        </div>
        {msg ? <div className="muted">{msg}</div> : null}

        {tab === 'carousel' && (
          <div className="stack">
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
                      placeholder="https://... o sube abajo"
                    />
                  </label>
                  <label className="btn ghost" style={{ cursor: 'pointer', width: 'fit-content' }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                  </div>
                  <button className="btn" type="button" onClick={addSlide}>
                    Agregar al carrusel
                  </button>
                </div>
              </div>
            </div>
            <div className="grid-cards">
              {slides.map((s) => (
                <div className="kpi" key={s.id} style={{ padding: 0, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: 120,
                      backgroundImage: `url(${s.imageUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                  <div style={{ padding: '0.85rem 1rem' }}>
                    <strong>{s.title || 'Sin título'}</strong>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {s.subtitle}
                    </div>
                    <button
                      className="btn ghost"
                      type="button"
                      style={{ marginTop: 10 }}
                      onClick={() => removeSlide(s.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'news' && (
          <div className="stack">
            <div className="panel">
              <div className="panel-head">
                <h2>Nueva noticia</h2>
              </div>
              <div className="panel-body">
                <div className="form">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                  </div>
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
                  <label className="btn ghost" style={{ cursor: 'pointer', width: 'fit-content' }}>
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
                  <button className="btn" type="button" onClick={addNews}>
                    Publicar noticia
                  </button>
                </div>
              </div>
            </div>
            <table className="table">
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
                    <td>{n.title}</td>
                    <td className="muted">{n.slug}</td>
                    <td>
                      <span className={`badge ${n.published ? 'ok' : 'warn'}`}>
                        {n.published ? 'Publicada' : 'Borrador'}
                      </span>
                    </td>
                    <td>
                      <button className="btn ghost" type="button" onClick={() => removeNews(n.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'sections' && (
          <div className="stack">
            <div className="row">
              {Object.keys(SECTION_META).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`btn ${sectionKey === key ? '' : 'ghost'}`}
                  onClick={() => setSectionKey(key)}
                >
                  {SECTION_META[key]}
                </button>
              ))}
            </div>
            <div className="panel">
              <div className="panel-head">
                <h2>{SECTION_META[sectionKey]}</h2>
              </div>
              <div className="panel-body">
                <div className="form" style={{ maxWidth: 640 }}>
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
                      rows={4}
                      value={draft.body || draft.sub || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, body: e.target.value, sub: e.target.value, lead: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    CTA
                    <input
                      value={draft.cta || ''}
                      onChange={(e) => setDraft({ ...draft, cta: e.target.value })}
                    />
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={published}
                      onChange={(e) => setPublished(e.target.checked)}
                    />
                    Publicado
                  </label>
                  <button className="btn" type="button" onClick={saveSection}>
                    Guardar sección
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
