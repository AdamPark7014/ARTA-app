import { NewsCard } from '@/components/site/SiteBlocks';
import { SitePage } from '@/components/site/SitePage';
import type { PublicSiteData } from '@/lib/public-site-data';
import { externalProps, paragraphs, publishedLabel, safeHref } from '@/lib/site-format';
import type { PublicNewsPost } from '@/lib/site-seo';

type NewsArticleViewProps = {
  post: PublicNewsPost | null;
  data: PublicSiteData;
};

export function NewsArticleView({ post, data }: NewsArticleViewProps) {
  if (!post) {
    return (
      <SitePage data={data}>
        <section className="sa-sec sa-sec--papel sa-page sa-notfound">
          <h1 className="sa-title">Noticia no encontrada</h1>
          <p className="sa-lead">El enlace puede estar desactualizado o la noticia fue retirada.</p>
          <a className="sa-btn" href="/p/arta#noticias">
            Ver todas las noticias
          </a>
        </section>
      </SitePage>
    );
  }

  const cta = safeHref(post.ctaHref);
  const more = data.news.filter((n) => n.slug !== post.slug).slice(0, 3);

  return (
    <SitePage data={data}>
      <article className="sa-sec sa-sec--papel sa-article">
        <header className="sa-article__head" data-reveal>
          <a className="sa-link sa-link--back" href="/p/arta/noticias">
            Noticias
          </a>
          <h1 className="sa-title sa-title--xl">{post.title}</h1>
          {post.excerpt ? <p className="sa-lead">{post.excerpt}</p> : null}
          {post.publishedAt ? <time dateTime={post.publishedAt}>{publishedLabel(post.publishedAt)}</time> : null}
        </header>
        {post.coverUrl ? (
          <div className="sa-article__cover" data-reveal>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL dinámica de Studio */}
            <img src={post.coverUrl} alt={post.title} decoding="async" />
          </div>
        ) : null}
        <div className="sa-prose" data-reveal>
          {paragraphs(post.body).map((text, i) => (
            <p key={i}>{text}</p>
          ))}
          {cta && post.ctaLabel ? (
            <p>
              <a className="sa-btn" href={cta} {...externalProps(cta)}>
                {post.ctaLabel}
              </a>
            </p>
          ) : null}
        </div>
      </article>
      {more.length ? (
        <section className="sa-sec sa-sec--blanco" aria-label="Más noticias">
          <header className="sa-head sa-head--wide">
            <div className="sa-head__copy">
              <h2 className="sa-title">Más noticias</h2>
            </div>
          </header>
          <div className="sa-newslist">
            {more.map((n) => (
              <NewsCard key={n.id} post={n} />
            ))}
          </div>
        </section>
      ) : null}
    </SitePage>
  );
}
