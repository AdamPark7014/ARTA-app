import { PrismaClient, EntityKey, ChecklistTemplateKey, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { ROLES, ROLE_PERMISSIONS, type RoleKey } from '../src/common/rbac/roles';

const prisma = new PrismaClient();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const SEED_ASSETS_DIR = path.join(__dirname, 'seed-assets');

function ensureSeedAsset(fileName: string): string {
  const src = path.join(SEED_ASSETS_DIR, fileName);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing seed asset: ${src}`);
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, fileName);
  fs.copyFileSync(src, dest);
  return `/uploads/${fileName}`;
}

const SEED_SLIDES = [
  {
    title: 'La experiencia del Show',
    subtitle: 'Producción integral de conciertos y eventos en Puebla',
    file: 'seed-hero-1.jpg',
    ctaLabel: 'Ver operación',
    ctaHref: '#modulos',
    sortOrder: 0,
  },
  {
    title: 'Escenario, luz y público',
    subtitle: 'Checklists, boletera, campaña y cierre en un solo flujo',
    file: 'seed-hero-2.jpg',
    ctaLabel: 'Conoce Arta',
    ctaHref: '#nosotros',
    sortOrder: 1,
  },
  {
    title: 'Cada detalle cuenta',
    subtitle: 'Hospitality, producción técnica y firmas digitales',
    file: 'seed-hero-3.jpg',
    ctaLabel: 'Noticias',
    ctaHref: '#noticias',
    sortOrder: 2,
  },
];

const SEED_NEWS = [
  {
    slug: 'temporada-puebla',
    title: 'Nueva temporada de shows en Puebla',
    excerpt: 'Producción, artes y boletera alineadas de punta a punta.',
    file: 'seed-news-1.jpg',
  },
  {
    slug: 'checklists-digitales',
    title: 'Checklists digitales con firma',
    excerpt: 'Entregado y autorizado quedan registrados en PDF por evento.',
    file: 'seed-news-2.jpg',
  },
  {
    slug: 'experiencia-show',
    title: 'La experiencia del Show',
    excerpt: 'Montaje, corrida y cierre con el sello Arta en cada venue.',
    file: 'seed-news-3.jpg',
  },
];

type Schema = {
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      id: string;
      label: string;
      type?: 'check' | 'text' | 'number' | 'date' | 'select';
      done?: boolean;
      value?: string | number | null;
      options?: string[];
    }>;
  }>;
};

function section(id: string, title: string, labels: string[]): Schema['sections'][0] {
  return {
    id,
    title,
    items: labels.map((label, i) => ({
      id: `${id}_${i + 1}`,
      label,
      type: 'check' as const,
      done: false,
      value: null,
    })),
  };
}

/** Bloque estándar de firmas digitales al final de cada plantilla */
function signaturesSection(): Schema['sections'][0] {
  return {
    id: 'firmas',
    title: 'Firmas digitales',
    items: [
      {
        id: 'firma_entregado_nota',
        label: 'Entregado — firma en panel (pad digital)',
        type: 'text',
        value: 'Usar botón Firmar entregado',
      },
      {
        id: 'firma_autorizado_nota',
        label: 'Autorizado — firma en panel (pad digital)',
        type: 'text',
        value: 'Usar botón Firmar autorizado',
      },
    ],
  };
}

function withSignatures(schema: Schema): Schema {
  const has = schema.sections.some((s) => s.id === 'firmas');
  return has ? schema : { sections: [...schema.sections, signaturesSection()] };
}

/** Vistas/módulos que debe ver cada persona (documentación viva del seed) */
const USER_VIEWS: Record<
  string,
  {
    entities: EntityKey[];
    homeEntity: EntityKey;
    modules: string[];
    notes: string;
  }
> = {
  'arturo@arta.mx': {
    entities: ['ARTA', 'EXPLANADA'],
    homeEntity: 'ARTA',
    modules: [
      'dashboard',
      'events',
      'checklists',
      'finance',
      'purchase-orders',
      'campaigns',
      'ticketing',
      'studio',
      'users',
      'site',
    ],
    notes: 'TODO en ambas entidades · usuarios · corrida · cierre',
  },
  'chacho@arta.mx': {
    entities: ['ARTA', 'EXPLANADA'],
    homeEntity: 'ARTA',
    modules: [
      'dashboard',
      'events',
      'checklists',
      'finance',
      'purchase-orders',
      'campaigns',
      'ticketing',
      'studio',
      'users',
      'site',
    ],
    notes: 'TODO en ambas · usuarios · corrida · cierre',
  },
  'melissa@arta.mx': {
    entities: ['ARTA'],
    homeEntity: 'ARTA',
    modules: [
      'dashboard',
      'events',
      'checklists',
      'finance',
      'purchase-orders',
      'campaigns',
      'ticketing',
      'studio',
      'site',
    ],
    notes: 'Solo Arta · campaña · corrida · autoriza OC Arta · Studio Arta',
  },
  'rodrigo@arema.mx': {
    entities: ['EXPLANADA', 'ARTA'],
    homeEntity: 'EXPLANADA',
    modules: [
      'dashboard',
      'events',
      'checklists',
      'finance',
      'purchase-orders',
      'campaigns',
      'ticketing',
      'studio',
      'site',
      'mantenimiento',
    ],
    notes: 'Home Auditorio · TODO Explanada · generales Arta · autoriza OC Auditorio',
  },
  'williams@arta.mx': {
    entities: ['ARTA', 'EXPLANADA'],
    homeEntity: 'ARTA',
    modules: ['dashboard', 'events', 'checklists', 'campaigns', 'ticketing', 'site'],
    notes: 'Generales ambos · edita campaña con Melissa · boletera',
  },
  'leida@arta.mx': {
    entities: ['ARTA', 'EXPLANADA'],
    homeEntity: 'ARTA',
    modules: ['dashboard', 'events', 'checklists', 'site'],
    notes: 'Generales · convenios / patrocinios',
  },
  'jp@arta.mx': {
    entities: ['ARTA', 'EXPLANADA'],
    homeEntity: 'ARTA',
    modules: ['dashboard', 'events', 'checklists', 'purchase-orders', 'site'],
    notes: 'Generales · marcar OC pagado · enlace gobierno',
  },
};

const TEMPLATES: Array<{
  key: ChecklistTemplateKey;
  name: string;
  description: string;
  entities: EntityKey[];
  schema: Schema;
}> = [
  {
    key: 'EVENTO_GENERAL',
    name: 'Checklist Evento General',
    description: 'Runbook maestro del show',
    entities: [],
    schema: {
      sections: [
        {
          id: 'header_fields',
          title: 'Encabezado',
          items: [
            { id: 'show', label: 'Show / concierto', type: 'text', value: '' },
            { id: 'fecha', label: 'Fecha', type: 'date', value: null },
            { id: 'hora', label: 'Hora', type: 'text', value: '' },
            { id: 'ciudad', label: 'Ciudad', type: 'text', value: '' },
            { id: 'venue', label: 'Venue', type: 'text', value: '' },
          ],
        },
        section('venue', 'Venue y energy', [
          'Venue confirmado',
          'Plantas de luz',
          'Campaña publicitaria vinculada',
          'Hospitality rider',
          'Catering',
          'Camerinos',
          'Carpas / mobiliario',
        ]),
        section('ops', 'Operación', [
          'Checklist transportación',
          'Checklist hospedaje',
          'Per diems',
          'Pagos staff / papelería',
          'Layout / planos',
          'Activaciones',
          'Vallas / gradas / sillas',
          'Señalética',
          'Extintores',
          'Credenciales',
          'Radios',
          'Uniformes',
        ]),
        section('seguridad', 'Seguridad y permisos', [
          'Seguridad / acomodadores / limpieza / ambulancia',
          'PC estatal / municipal',
          'Bomberos',
          'Pirotecnia',
          'DRO / perito',
          'Impuestos / bares',
          'Sanitarios portátiles / VIP',
        ]),
        section('escenario', 'Escenario', [
          'Triplay / portafloor',
          'Pipas de agua',
          'Stage hands',
        ]),
      ],
    },
  },
  {
    key: 'PRODUCCION',
    name: 'Checklist Producción',
    description: 'Rider, vendors técnicos y tiempos',
    entities: [],
    schema: {
      sections: [
        {
          id: 'riders',
          title: 'Riders',
          items: [
            { id: 'rider_orig', label: 'Rider original recibido', type: 'check', done: false },
            { id: 'rider_acept', label: 'Rider aceptado', type: 'check', done: false },
          ],
        },
        section('vendors', 'Vendors', [
          'Audio',
          'Luces',
          'Planta de luz',
          'FX / efectos',
          'Backline',
          'Stage / ground support',
          'Stage hands',
        ]),
        {
          id: 'pms',
          title: 'Project managers',
          items: [
            { id: 'pm_artista', label: 'PM artista', type: 'text', value: '' },
            { id: 'pm_promotor', label: 'PM promotor', type: 'text', value: '' },
          ],
        },
        section('schedule', 'Agenda técnica', [
          'Acceso venue / load-in',
          'Minuto a minuto montaje',
          'Layout aprobado',
        ]),
      ],
    },
  },
  {
    key: 'HOSPEDAJE',
    name: 'Checklist Hospedaje',
    description: 'Hotel, habitaciones, partidos A/B',
    entities: [],
    schema: {
      sections: [
        {
          id: 'hotel',
          title: 'Hotel',
          items: [
            { id: 'nombre', label: 'Nombre del hotel', type: 'text', value: '' },
            { id: 'contacto', label: 'Contacto hotel', type: 'text', value: '' },
            { id: 'habitaciones', label: 'Núm. habitaciones', type: 'number', value: 0 },
            { id: 'desayuno', label: 'Desayuno incluido', type: 'check', done: false },
            { id: 'notas', label: 'Notas', type: 'text', value: '' },
          ],
        },
        section('partidos', 'Confirmaciones', [
          'Party A confirmado',
          'Party B confirmado',
          'Confirmaciones enviadas',
        ]),
      ],
    },
  },
  {
    key: 'TRANSPORTACION',
    name: 'Checklist Transportación',
    description: 'Vans, vuelos y traslados',
    entities: [],
    schema: {
      sections: [
        {
          id: 'provider',
          title: 'Proveedor',
          items: [
            { id: 'prov', label: 'Proveedor', type: 'text', value: '' },
            { id: 'contacto', label: 'Contacto', type: 'text', value: '' },
            { id: 'vans', label: 'Núm. vans', type: 'number', value: 0 },
            { id: 'modelo', label: 'Modelo', type: 'text', value: '' },
            { id: 'incluye', label: 'Qué incluye', type: 'text', value: '' },
            {
              id: 'status',
              label: 'Estatus',
              type: 'select',
              options: ['Pendiente', 'Confirmado', 'En ruta', 'Completado'],
              value: 'Pendiente',
            },
          ],
        },
        section('vuelos', 'Vuelos / aéreos', [
          'Vuelos artista cotizados',
          'Vuelos confirmados',
          'Traslados aeropuerto',
        ]),
      ],
    },
  },
  {
    key: 'RUEDA_PRENSA',
    name: 'Checklist Rueda de Prensa',
    description: 'Formato RP distinto a producción',
    entities: [],
    schema: {
      sections: [
        {
          id: 'rp',
          title: 'Datos RP',
          items: [
            { id: 'fecha', label: 'Fecha RP', type: 'date', value: null },
            { id: 'hora', label: 'Hora', type: 'text', value: '' },
            { id: 'ciudad', label: 'Ciudad', type: 'text', value: '' },
            { id: 'venue', label: 'Venue RP', type: 'text', value: '' },
            { id: 'contacto_venue', label: 'Contacto venue', type: 'text', value: '' },
          ],
        },
        section('tech', 'Técnica RP', [
          'Vendor AV / micrófonos',
          'Coffee break asignado',
          'Banners / pantallas',
          'Identificadores de mesa',
          'Prensa confirmada',
        ]),
      ],
    },
  },
  {
    key: 'ARTES_SHOWS',
    name: 'Checklist Info Artes Shows',
    description: 'Entregables creativos y autorización',
    entities: [],
    schema: {
      sections: [
        {
          id: 'meta',
          title: 'Meta',
          items: [
            { id: 'promotores', label: 'Promotores', type: 'text', value: '' },
            { id: 'boletera', label: 'Boletera', type: 'text', value: '' },
            { id: 'sponsors', label: 'Sponsors', type: 'text', value: '' },
          ],
        },
        section('artes', 'Entregables', [
          'FB 1350',
          'IG 1440',
          'Story 1920',
          'Precios',
          'Reel general',
          'Fecha solicitud',
          'Fecha cambios',
          'Firma / autorización',
        ]),
      ],
    },
  },
  {
    key: 'BOLETERA',
    name: 'Creación Boletera',
    description: 'Hold, artista, promotor, zonas y precios',
    entities: [],
    schema: {
      sections: [
        {
          id: 'setup',
          title: 'Setup',
          items: [
            {
              id: 'boletera',
              label: 'Boletera',
              type: 'select',
              options: ['Arema', 'eTicket', 'Otra'],
              value: 'Arema',
            },
            { id: 'hold', label: 'Hold hasta', type: 'date', value: null },
            { id: 'artista', label: 'Artista', type: 'text', value: '' },
            { id: 'promotor', label: 'Promotor', type: 'text', value: '' },
            { id: 'venue', label: 'Venue', type: 'text', value: '' },
            { id: 'descripcion', label: 'Descripción evento', type: 'text', value: '' },
          ],
        },
        section('zonas', 'Zonas', ['Tabla zonas / aforo / precio cargada']),
      ],
    },
  },
  {
    key: 'PENDONES',
    name: 'Distribución de Pendones',
    description: 'Campañas de vía pública por oleadas',
    entities: [],
    schema: {
      sections: [
        section('oleadas', 'Oleadas', [
          'Primera parte colocada',
          'Segunda parte colocada',
          'Tercera parte colocada',
          'Excel de avenidas actualizado',
        ]),
      ],
    },
  },
  {
    key: 'ORDEN_COMPRA',
    name: 'Orden de Compra (plantilla)',
    description: 'OC por rubro — módulo de OC para autorizar/pagar',
    entities: [],
    schema: {
      sections: [
        section('flujo', 'Flujo OC', [
          'OC creada por rubro',
          'Pendiente autorización',
          'Autorizada',
          'Pagada / comprobante',
        ]),
      ],
    },
  },
  {
    key: 'CATERING',
    name: 'Catering y Camerinos',
    description: 'Hospitality backstage',
    entities: [],
    schema: {
      sections: [
        section('cat', 'Catering / camerinos', [
          'Menú confirmado',
          'Camerinos listos',
          'Restricciones dietéticas',
          'Horarios servicio',
        ]),
      ],
    },
  },
  {
    key: 'CORRIDA_FINANCIERA',
    name: 'Corrida financiera',
    description: 'Solo editable por Melissa, Chacho y Arturo',
    entities: [],
    schema: {
      sections: [
        section('fin', 'Control', [
          'Presupuesto cargado',
          'Ingresos capturados',
          'Egresos capturados',
          'Cierre cuadrado',
        ]),
      ],
    },
  },
  {
    key: 'CAMPANA',
    name: 'Campaña publicitaria',
    description: 'Edición: Melissa y Williams',
    entities: [],
    schema: {
      sections: [
        {
          id: 'camp',
          title: 'Campaña',
          items: [
            {
              id: 'tipo',
              label: 'Tipo',
              type: 'select',
              options: ['Interna', 'Externa'],
              value: 'Interna',
            },
            { id: 'autorizada', label: 'Autorizada', type: 'check', done: false },
            { id: 'notas', label: 'Notas', type: 'text', value: '' },
          ],
        },
      ],
    },
  },
  {
    key: 'ANTICIPOS',
    name: 'Anticipos y pagos',
    description: 'Plantilla de anticipos + comprobantes',
    entities: [],
    schema: {
      sections: [
        section('ant', 'Anticipos', [
          'Anticipos solicitados',
          'Comprobantes subidos',
          'Conciliación',
        ]),
      ],
    },
  },
  {
    key: 'MANTENIMIENTO',
    name: 'Mantenimiento (Auditorio)',
    description: 'Mantenimiento Explanada / Auditorio Arema',
    entities: ['EXPLANADA'],
    schema: {
      sections: [
        section('mant', 'Mantenimiento', [
          'Inspección venue',
          'Reparaciones',
          'Inventario técnico',
        ]),
      ],
    },
  },
];

type SeedUser = {
  email: string;
  fullName: string;
  title: string;
  roleKey: RoleKey;
  entities: EntityKey[];
  permissions: string[];
  /** Override password via env SEED_PASS_<ALIAS> */
  passAlias: string;
};

const USERS: SeedUser[] = [
  {
    email: 'arturo@arta.mx',
    fullName: 'Arturo Taja',
    title: 'Director general de Arta',
    roleKey: ROLES.DIR_GENERAL,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.DIR_GENERAL]],
    passAlias: 'ARTURO',
  },
  {
    email: 'chacho@arta.mx',
    fullName: 'José Luis Arista',
    title: 'Director general de Arta',
    roleKey: ROLES.DIR_GENERAL,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.DIR_GENERAL]],
    passAlias: 'CHACHO',
  },
  {
    email: 'melissa@arta.mx',
    fullName: 'Melissa Astudillo',
    title: 'Gerente general de Arta',
    roleKey: ROLES.GERENTE_ARTA,
    entities: ['ARTA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.GERENTE_ARTA]],
    passAlias: 'MELISSA',
  },
  {
    email: 'rodrigo@arema.mx',
    fullName: 'Rodrigo López',
    title: 'Director Auditorio Arema',
    roleKey: ROLES.DIR_AUDITORIO,
    entities: ['EXPLANADA', 'ARTA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.DIR_AUDITORIO]],
    passAlias: 'RODRIGO',
  },
  {
    email: 'williams@arta.mx',
    fullName: 'Williams Taja',
    title: 'Logística y producción',
    roleKey: ROLES.LOGISTICA,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.LOGISTICA]],
    passAlias: 'WILLIAMS',
  },
  {
    email: 'leida@arta.mx',
    fullName: 'Leida Osorio',
    title: 'Convenios y patrocinios',
    roleKey: ROLES.CONVENIOS,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.CONVENIOS]],
    passAlias: 'LEIDA',
  },
  {
    email: 'jp@arta.mx',
    fullName: 'Juan Pablo Ramírez',
    title: 'Enlace gobierno y pagos',
    roleKey: ROLES.ENLACE_GOBIERNO,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [...ROLE_PERMISSIONS[ROLES.ENLACE_GOBIERNO]],
    passAlias: 'JP',
  },
];

function passwordFor(alias: string) {
  const specific = process.env[`SEED_PASS_${alias}`];
  if (specific && specific.length >= 6) return specific;
  const fallback = process.env.SEED_PASSWORD;
  if (fallback && fallback.length >= 6) return fallback;
  // Dev-only fallback — never shown on login UI
  return 'ArtaDevLocal-1';
}

const STUDIO_CONTENT: Array<{ sectionKey: string; title: string; contentJson: Record<string, unknown> }> = [
  {
    sectionKey: 'home_hero',
    title: 'Hero',
    contentJson: {
      brand: 'arta',
      brandSub: 'PRODUCCIONES',
      headline: 'La experiencia del Show',
      sub: 'Producción integral de conciertos y eventos: checklists, campaña, boletera, corrida financiera y cierre con firmas digitales.',
      cta: 'Ver operación',
      ctaHref: '#modulos',
    },
  },
  {
    sectionKey: 'home_modulos',
    title: 'Módulos',
    contentJson: {
      headline: 'Todo el flujo del evento',
      lead: 'Formatos editables, PDF por checklist, órdenes de compra y Studio web.',
      tiles: [
        { title: 'Producción', body: 'Riders, plantas de luz, stage hands y minuto a minuto.' },
        { title: 'Hospitality', body: 'Hospedaje, transporte, catering y camerinos.' },
        { title: 'Comercial', body: 'Boletera, patrocinios, artes y campaña autorizada.' },
        { title: 'Cierre', body: 'Corrida financiera, anticipos y firmas entregado / autorizado.' },
      ],
    },
  },
  {
    sectionKey: 'home_cta',
    title: 'CTA',
    contentJson: {
      headline: 'Hablemos de tu próximo show',
      body: 'Cuéntanos tu fecha, venue y alcance. Te respondemos con una propuesta de producción.',
      cta: 'Escribir a Arta',
      ctaHref: 'mailto:contacto@artaproducciones.com',
    },
  },
];

async function main() {
  console.log('Seeding ARTA users, templates, studio…');

  for (const u of USERS) {
    const plain = passwordFor(u.passAlias);
    const passwordHash = await bcrypt.hash(plain, 12);
    const views = USER_VIEWS[u.email];
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        fullName: u.fullName,
        title: u.title,
        roleKey: u.roleKey,
        entities: u.entities,
        permissions: u.permissions,
        passwordHash,
        active: true,
      },
      update: {
        fullName: u.fullName,
        title: u.title,
        roleKey: u.roleKey,
        entities: u.entities,
        permissions: u.permissions,
        passwordHash,
        active: true,
      },
    });
    console.log(
      `  ✓ ${u.fullName} · ${u.entities.join('+')} · módulos: ${(views?.modules || []).join(', ')}`,
    );
  }

  for (const t of TEMPLATES) {
    const schema = withSignatures(t.schema);
    const existing = await prisma.checklistTemplate.findFirst({ where: { key: t.key } });
    if (existing) {
      await prisma.checklistTemplate.update({
        where: { id: existing.id },
        data: {
          name: t.name,
          description: t.description,
          entities: t.entities,
          schemaJson: schema,
          active: true,
        },
      });
    } else {
      await prisma.checklistTemplate.create({
        data: {
          key: t.key,
          name: t.name,
          description: t.description,
          entities: t.entities,
          schemaJson: schema,
          active: true,
        },
      });
    }
  }
  console.log(`  ✓ ${TEMPLATES.length} plantillas checklist`);

  await prisma.pageContent.deleteMany({ where: { entity: 'EXPLANADA' } });
  await prisma.heroSlide.deleteMany({ where: { entity: 'EXPLANADA' } });
  for (const page of STUDIO_CONTENT) {
    await prisma.pageContent.upsert({
      where: { entity_sectionKey: { entity: 'ARTA', sectionKey: page.sectionKey } },
      create: {
        entity: 'ARTA',
        sectionKey: page.sectionKey,
        title: page.title,
        published: true,
        contentJson: page.contentJson as Prisma.InputJsonValue,
      },
      update: {
        title: page.title,
        published: true,
        contentJson: page.contentJson as Prisma.InputJsonValue,
      },
    });
  }
  await prisma.heroSlide.deleteMany({ where: { entity: 'ARTA' } });
  for (const s of SEED_SLIDES) {
    const imageUrl = ensureSeedAsset(s.file);
    await prisma.heroSlide.create({
      data: {
        entity: 'ARTA',
        title: s.title,
        subtitle: s.subtitle,
        imageUrl,
        ctaLabel: s.ctaLabel,
        ctaHref: s.ctaHref,
        sortOrder: s.sortOrder,
        active: true,
      },
    });
  }

  for (const n of SEED_NEWS) {
    const coverUrl = ensureSeedAsset(n.file);
    await prisma.newsPost.upsert({
      where: { entity_slug: { entity: 'ARTA', slug: n.slug } },
      create: {
        entity: 'ARTA',
        slug: n.slug,
        title: n.title,
        excerpt: n.excerpt,
        coverUrl,
        published: true,
        publishedAt: new Date(),
      },
      update: {
        title: n.title,
        excerpt: n.excerpt,
        coverUrl,
        published: true,
        publishedAt: new Date(),
      },
    });
  }
  console.log('  ✓ Studio pages + slides + news Arta (assets en uploads)');

  console.log('\nSeed OK.');
  console.log('Passwords: SEED_PASSWORD o SEED_PASS_<ALIAS> (ARTURO, MELISSA, RODRIGO…).');
  console.log('Default dev (si no hay env): ArtaDevLocal-1');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
