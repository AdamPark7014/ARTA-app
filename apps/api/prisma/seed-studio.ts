import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Contenido inicial del sitio público.
 *
 * El seed corre en cada arranque del contenedor (`docker/api-entrypoint.sh`). Hasta el 01-11-2026
 * reescribía las secciones, BORRABA los slides y volvía a publicar las noticias en cada despliegue:
 * todo lo hecho en Studio se perdía. Ahora solo siembra una base que no tiene nada del sitio; una
 * base con contenido no se toca.
 *
 * Única excepción, por una vez: `retirePlaceholders` cambia el texto de relleno de la semilla vieja
 * (hablaba de checklists y de «Studio web» al público) si sigue idéntico. Lo que alguien ya editó se
 * queda como está, y las tres notas de relleno pasan a borrador, nunca se borran.
 */

const HERO = {
  headline: 'La experiencia del Show',
  sub: 'Producimos conciertos y espectáculos en Puebla: del primer boceto a la última luz del escenario.',
  cta: 'Ver cartelera',
  ctaHref: '#cartelera',
};

const ABOUT = {
  eyebrow: 'Nosotros',
  headline: 'Producimos el show completo',
  body:
    'Somos la productora detrás de lo que pasa arriba y abajo del escenario. Montaje, audio e iluminación, hospitalidad para los artistas, boletaje, campaña y cierre: una sola mano de principio a fin, con el mismo cuidado en cada fecha.',
  stats: [
    { label: 'Show', text: 'Producción integral de conciertos y espectáculos' },
    { label: 'Puebla', text: 'Nuestra base, con shows en toda la región' },
    { label: 'Equipo', text: 'Del rider al último aplauso' },
  ],
};

const MODULOS = {
  eyebrow: 'Lo que hacemos',
  headline: 'Todo lo que un show necesita',
  lead: 'Un solo equipo se hace cargo de cada parte, para que el público solo tenga que llegar y vivirlo.',
  tiles: [
    { title: 'Producción', body: 'Audio, iluminación, escenario, plantas de luz y staff, con su minuto a minuto.' },
    { title: 'Hospitalidad', body: 'Hospedaje, traslados, alimentos y camerinos para artistas y equipo.' },
    { title: 'Comercial', body: 'Boletaje, patrocinios, artes y campaña de difusión.' },
    { title: 'Cierre', body: 'Cuentas claras, proveedores liquidados y un reporte de cada fecha.' },
  ],
};

const CTA = {
  eyebrow: 'Contacto',
  headline: 'Hablemos de tu próximo show',
  body: 'Cuéntanos la fecha, el recinto y lo que tienes en mente. Te respondemos con una propuesta de producción.',
  cta: 'Escribir a Arta',
};

const STUDIO_PAGES: Array<{ sectionKey: string; title: string; contentJson: Record<string, unknown> }> = [
  { sectionKey: 'home_hero', title: 'Portada', contentJson: HERO },
  { sectionKey: 'home_about', title: 'Nosotros', contentJson: ABOUT },
  { sectionKey: 'home_modulos', title: 'Servicios', contentJson: MODULOS },
  { sectionKey: 'home_cta', title: 'Contacto', contentJson: CTA },
];

const SEED_SLIDES = [
  {
    title: 'La experiencia del Show',
    subtitle: 'Producimos conciertos y espectáculos en Puebla',
    file: 'seed-hero-1.jpg',
    ctaLabel: 'Ver cartelera',
    ctaHref: '#cartelera',
    sortOrder: 0,
  },
  {
    title: 'Escenario, luz y público',
    subtitle: 'Cada fecha, con el mismo cuidado de principio a fin',
    file: 'seed-hero-2.jpg',
    ctaLabel: 'Conoce Arta',
    ctaHref: '#nosotros',
    sortOrder: 1,
  },
  {
    title: 'Cada detalle cuenta',
    subtitle: 'Audio, iluminación, hospitalidad y boletaje en una sola mano',
    file: 'seed-hero-3.jpg',
    ctaLabel: 'Lo que hacemos',
    ctaHref: '#modulos',
    sortOrder: 2,
  },
];

/** Lo que la semilla anterior escribió tal cual: solo esto se reemplaza. */
const LEGACY_PAGES: Record<string, unknown> = {
  home_hero: {
    brand: 'arta',
    brandSub: 'PRODUCCIONES',
    headline: 'La experiencia del Show',
    sub: 'Producción integral de conciertos y eventos: checklists, campaña, boletera, corrida financiera y cierre con firmas digitales.',
    cta: 'Ver operación',
    ctaHref: '#modulos',
  },
  home_about: {
    headline: 'Producimos el show completo',
    body:
      'Somos la productora detrás de la experiencia: producción técnica, hospitality, artes, boletera, campaña y cierre financiero. Operamos con el mismo rigor en cada concierto.',
    location:
      'Base operativa en Puebla y venue aliado Auditorio Arema Explanada. Producción integral de conciertos y eventos en la región.',
    stats: [
      { label: 'Shows', text: 'Producción integral de conciertos' },
      { label: 'Puebla', text: 'Base operativa y venues aliados' },
      { label: 'Experiencia', text: 'Del rider al cierre del evento' },
    ],
  },
  home_modulos: {
    headline: 'Todo el flujo del evento',
    lead: 'Formatos editables, PDF por checklist, órdenes de compra y Studio web.',
    tiles: [
      { title: 'Producción', body: 'Riders, plantas de luz, stage hands y minuto a minuto.' },
      { title: 'Hospitality', body: 'Hospedaje, transporte, catering y camerinos.' },
      { title: 'Comercial', body: 'Boletera, patrocinios, artes y campaña autorizada.' },
      { title: 'Cierre', body: 'Corrida financiera, anticipos y firmas entregado / autorizado.' },
    ],
  },
  home_cta: {
    headline: 'Hablemos de tu próximo show',
    body: 'Cuéntanos tu fecha, venue y alcance. Te respondemos con una propuesta de producción.',
    cta: 'Escribir a Arta',
    ctaHref: 'mailto:contacto@artaproducciones.com',
  },
};

const LEGACY_SLIDES: Record<string, string> = {
  'La experiencia del Show': 'Producción integral de conciertos y eventos en Puebla',
  'Escenario, luz y público': 'Checklists, boletera, campaña y cierre en un solo flujo',
  'Cada detalle cuenta': 'Hospitality, producción técnica y firmas digitales',
};

const LEGACY_NEWS = [
  { slug: 'temporada-puebla', title: 'Nueva temporada de shows en Puebla' },
  { slug: 'checklists-digitales', title: 'Checklists digitales con firma' },
  { slug: 'experiencia-show', title: 'La experiencia del Show' },
];

/** Igualdad por contenido: Postgres no conserva el orden de las llaves de un JSON. */
function sameJson(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      return Object.keys(v as object)
        .sort()
        .map((k) => [k, canon((v as Record<string, unknown>)[k])]);
    }
    return v;
  };
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

async function retirePlaceholders(prisma: PrismaClient) {
  let changed = 0;
  for (const page of STUDIO_PAGES) {
    const row = await prisma.pageContent.findUnique({
      where: { entity_sectionKey: { entity: 'ARTA', sectionKey: page.sectionKey } },
    });
    if (row && sameJson(row.contentJson, LEGACY_PAGES[page.sectionKey])) {
      await prisma.pageContent.update({
        where: { id: row.id },
        data: { title: page.title, contentJson: page.contentJson as Prisma.InputJsonValue },
      });
      changed += 1;
    }
  }

  for (const seed of SEED_SLIDES) {
    const { count } = await prisma.heroSlide.updateMany({
      where: { entity: 'ARTA', title: seed.title, subtitle: LEGACY_SLIDES[seed.title] },
      data: { subtitle: seed.subtitle, ctaLabel: seed.ctaLabel, ctaHref: seed.ctaHref },
    });
    changed += count;
  }

  // Notas sin texto y con fecha de «hoy» en cada despliegue: no son noticias reales.
  for (const note of LEGACY_NEWS) {
    const { count } = await prisma.newsPost.updateMany({
      where: { entity: 'ARTA', slug: note.slug, title: note.title, body: null, published: true },
      data: { published: false, publishedAt: null },
    });
    changed += count;
  }
  return changed;
}

export async function seedStudioContent(prisma: PrismaClient, ensureSeedAsset: (file: string) => string) {
  // Los archivos sí se copian siempre: lo sembrado no debe quedar con la imagen rota en un volumen nuevo.
  const slides = SEED_SLIDES.map((s) => ({ ...s, imageUrl: ensureSeedAsset(s.file) }));

  const hasSite = (await prisma.pageContent.count({ where: { entity: 'ARTA' } })) > 0;
  if (hasSite) {
    const changed = await retirePlaceholders(prisma);
    console.log(`  ✓ Studio: contenido respetado${changed ? ` · ${changed} textos de relleno retirados` : ''}`);
    return;
  }

  for (const page of STUDIO_PAGES) {
    await prisma.pageContent.create({
      data: {
        entity: 'ARTA',
        sectionKey: page.sectionKey,
        title: page.title,
        published: true,
        contentJson: page.contentJson as Prisma.InputJsonValue,
      },
    });
  }
  for (const s of slides) {
    await prisma.heroSlide.create({
      data: {
        entity: 'ARTA',
        title: s.title,
        subtitle: s.subtitle,
        imageUrl: s.imageUrl,
        ctaLabel: s.ctaLabel,
        ctaHref: s.ctaHref,
        sortOrder: s.sortOrder,
        active: true,
      },
    });
  }
  console.log('  ✓ Studio: base nueva, secciones y portada iniciales');
}
