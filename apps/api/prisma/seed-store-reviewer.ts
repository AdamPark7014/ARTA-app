/**
 * Cuenta de revisión para App Store y Google Play.
 *
 * Apple (guía 2.1) y Google (Play Console → Contenido de la app → Acceso a la
 * app) piden credenciales para entrar a una app que está toda detrás de login.
 * Dar la cuenta de alguien del equipo le enseñaría al revisor eventos,
 * proveedores, montos y conversaciones reales de Arta, así que la cuenta vive
 * en su propia organización: «ARTA Demo · Revisión de tiendas». El API filtra
 * todo por `organizationId` (common/tenant.ts), y ese aislamiento es el que la
 * deja fuera de los datos de Arta.
 *
 * QUÉ DEJA
 *  - Organización `arta-demo-revision-tiendas` (id fijo `org_arta_store_review`)
 *    con 2FA obligatorio apagado y la marca `storeReviewDemo` en settingsJson.
 *  - El revisor (correo de STORE_REVIEWER_EMAIL): activo, sin TOTP, sin
 *    candado, solo en la organización demo, rol `enlace_gobierno` + el permiso
 *    fino `po.authorize`. Por qué ese rol: ver docs/store/CUENTA-REVISION.md.
 *  - Tres compañeros ficticios (@example.com, sin contraseña utilizable).
 *  - Tres eventos futuros en recintos ficticios de Puebla, tareas en todos los
 *    estados, una OC y un anticipo por aprobar, avisos, notas de calendario y
 *    chat (#general, #anuncios, canal del evento y un directo).
 *
 * AISLAMIENTO. Solo escribe en la organización demo. Si el slug o el id fijo
 * los tiene otra organización, si la demo no lleva la marca, si el correo de
 * cualquier persona ya existe en otra organización, o si una fila con id de la
 * demo cuelga de otra cosa, aborta; todo va en una transacción, así que no
 * queda nada a medias. Lo único que lee fuera de la demo es un conteo de
 * eventos/usuarios sin organización (para avisar, no para tocarlos).
 * Las filas llevan ids deterministas (hash de una clave), así que correrlo N
 * veces no duplica: reescribe. También devuelve la demo a su estado inicial
 * (estados, fechas relativas a hoy) si el revisor la dejó a medias.
 *
 * CONTRASEÑA. Solo de la variable STORE_REVIEWER_PASSWORD; sin ella no corre.
 * Nunca se imprime. Si cambia respecto a la guardada, se revocan las sesiones
 * abiertas del revisor.
 *
 * Uso (desde apps/api):
 *   STORE_REVIEWER_PASSWORD=… npx ts-node --transpile-only prisma/seed-store-reviewer.ts --dry
 *   STORE_REVIEWER_PASSWORD=… npx ts-node --transpile-only prisma/seed-store-reviewer.ts
 * Fuera de una base local (o con NODE_ENV=production) exige además
 * `--confirm-produccion`. En producción se corre con
 * `apps/api/scripts/resembrar-cuenta-revision.ps1`, que pide la contraseña sin
 * mostrarla y la manda por la entrada estándar de SSH.
 */
import { createHash, randomBytes } from 'crypto';
import { ChatChannelKind, ChatMessageKind, EntityKey, Prisma, PrismaClient, TaskStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  PERMISSIONS,
  ROLES,
  canAccessEventOps,
  hasPermission,
  isDirectionRole,
  type EntityKey as RbacEntity,
  type Permission,
  type RoleKey,
} from '../src/common/rbac/roles';
import { DEFAULT_ORG_ID } from '../src/common/tenant';
import { DEFAULT_PO_WINDOW } from '../src/purchase-orders/po-window';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_ORG_ID: string = 'org_arta_store_review';
const DEMO_ORG_SLUG = 'arta-demo-revision-tiendas';
const DEMO_ORG_NAME = 'ARTA Demo · Revisión de tiendas';
/** Marca en settingsJson: sin ella, una organización con este id/slug no es la demo. */
const DEMO_MARKER = 'storeReviewDemo';

const DEFAULT_REVIEWER_EMAIL = 'revision.tiendas@artaproducciones.com';
const REVIEWER_NAME = 'Demo Revisor';
const REVIEWER_TITLE = 'Cuenta de demostración · App Store y Google Play';
/**
 * `enlace_gobierno` + `po.authorize`: ve Inicio, Chats, Tareas, Avisos,
 * Aprobaciones (OC y anticipos) y Eventos de ARTA y Explanada, y NO tiene
 * `studio.edit` (el sitio público no está separado por organización), ni
 * plantillas de formatos (globales), ni usuarios u organizaciones.
 */
const REVIEWER_ROLE: RoleKey = ROLES.ENLACE_GOBIERNO;
const REVIEWER_EXTRA_PERMISSIONS: Permission[] = [PERMISSIONS.PO_AUTHORIZE];
const ALL_ENTITIES: EntityKey[] = ['ARTA', 'EXPLANADA'];

const TZ = 'America/Mexico_City';
const IVA = 0.16; // PO_IVA_RATE de purchase-orders.controller
const BCRYPT_ROUNDS = 12; // users.controller
const MIN_PASSWORD = 12;
const DAY_MS = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Argumentos y entorno
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_FLAGS = new Set(['--dry', '--confirm-produccion', '--help', '-h']);
const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const DRY = has('--dry');
const NOW = new Date();

class Abort extends Error {}
function fail(message: string): never {
  throw new Abort(message);
}

let secretForRedaction = '';
/** Quita la contraseña y cualquier hash bcrypt de lo que se vaya a imprimir. */
function redact(text: string): string {
  let out = text.replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[hash]');
  if (secretForRedaction) out = out.split(secretForRedaction).join('[oculta]');
  return out.replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgresql://***@');
}

function dbTarget(url: string): { host: string; port: string; db: string } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port || '5432', db: u.pathname.replace(/^\//, '') };
  } catch {
    return null;
  }
}

/**
 * Local = el Postgres de esta máquina y sin NODE_ENV=production. Más estricto
 * que upgrade-format-templates.ts: allá el host `db` cuenta como local, pero
 * `db` es justo el nombre del Postgres de producción dentro de docker compose.
 */
function isLocalDb(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const target = dbTarget(process.env.DATABASE_URL || '');
  return !!target && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.host);
}

function readPassword(): string {
  const raw = process.env.STORE_REVIEWER_PASSWORD;
  // Se borra del entorno en cuanto se lee: nada de lo que se lance después la hereda.
  delete process.env.STORE_REVIEWER_PASSWORD;
  if (!raw) {
    fail('Falta STORE_REVIEWER_PASSWORD. La contraseña solo se acepta por esa variable (nunca por argumento).');
  }
  if (/[\r\n]/.test(raw)) fail('La contraseña trae un salto de línea.');
  if (raw !== raw.trim()) fail('La contraseña empieza o termina con espacios: el revisor no los va a teclear.');
  if (raw.length < MIN_PASSWORD) fail(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  secretForRedaction = raw;
  return raw;
}

function readEmail(): string {
  const email = (process.env.STORE_REVIEWER_EMAIL || DEFAULT_REVIEWER_EMAIL).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`STORE_REVIEWER_EMAIL no parece un correo: ${email}`);
  return email;
}

/**
 * Si un cambio de roles.ts volviera demasiado poderoso al rol del revisor, el
 * sembrado se niega en vez de entregárselo a Apple.
 */
function assertReviewerAccess() {
  const role = REVIEWER_ROLE;
  const extra = REVIEWER_EXTRA_PERMISSIONS as string[];
  const problems: string[] = [];
  if (role === ROLES.SUPER_ADMIN) problems.push('super_admin cruza organizaciones');
  if (isDirectionRole(role)) problems.push('rol de dirección');
  if (role === ROLES.GERENTE_ARTA || role === ROLES.DIR_AUDITORIO) problems.push('edita plantillas globales de formatos');
  if (hasPermission(role, extra, PERMISSIONS.STUDIO_EDIT)) problems.push('studio.edit edita el sitio público de Arta');
  if (hasPermission(role, extra, PERMISSIONS.USERS_MANAGE)) problems.push('users.manage');
  if (hasPermission(role, extra, PERMISSIONS.EVERYTHING)) problems.push('everything');
  if (!hasPermission(role, extra, PERMISSIONS.PO_AUTHORIZE)) problems.push('sin po.authorize no hay Aprobaciones de OC');
  for (const entity of ALL_ENTITIES) {
    if (!canAccessEventOps(ALL_ENTITIES as RbacEntity[], role, entity as RbacEntity)) {
      problems.push(`sin operación de eventos en ${entity}`);
    }
  }
  if (problems.length) fail(`El rol del revisor (${role}) no sirve: ${problems.join('; ')}.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fechas en la zona de la operación (el contenedor corre en UTC)
// ─────────────────────────────────────────────────────────────────────────────

type Ymd = { y: number; m: number; d: number };

function partsInTz(at: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second };
}

function offsetMs(at: Date): number {
  const p = partsInTz(at);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(at.getTime() / 1000) * 1000;
}

function todayLocal(): Ymd {
  const p = partsInTz(NOW);
  return { y: p.y, m: p.m, d: p.d };
}

function plusDays(base: Ymd, days: number): Ymd {
  const t = new Date(Date.UTC(base.y, base.m - 1, base.d) + days * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Instante UTC de una hora de pared en `TZ` (dos pasadas por si hay cambio de horario). */
function atLocal(day: Ymd, hh: number, mm = 0): Date {
  const wall = Date.UTC(day.y, day.m - 1, day.d, hh, mm, 0);
  let ts = wall - offsetMs(new Date(wall));
  ts = wall - offsetMs(new Date(ts));
  return new Date(ts);
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (day: Ymd) => `${day.y}-${pad(day.m)}-${pad(day.d)}`;
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const plusMs = (date: Date, ms: number) => new Date(date.getTime() + ms);

const mxn = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const whenLabel = (date: Date) =>
  date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Id determinista con forma de cuid: la misma clave da la misma fila en cada corrida. */
function demoId(key: string): string {
  return `c${createHash('sha256').update(`arta-store-review:${key}`).digest('hex').slice(0, 24)}`;
}

// Copias de chat/chat-text.ts (ese módulo arrastra el almacenamiento de adjuntos al importarse).
const dmKeyOf = (a: string, b: string) => [a, b].sort().join(':');
function slugify(name: string, max = 60): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}
function preview(body: string, max = 140): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}
function taskLink(eventId: string | null, taskId: string) {
  return eventId ? `/events/${eventId}?tab=tasks&task=${taskId}` : `/tasks?task=${taskId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro de pasos (y modo --dry)
// ─────────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
/**
 * Todo el sembrado pasa por `db`: al aplicar es el cliente de una transacción,
 * así que si una guarda falla a medio camino no queda nada escrito.
 */
let db: Prisma.TransactionClient = prisma;
const counts = { crear: 0, actualizar: 0, borrar: 0 };

async function step(kind: string, label: string, exists: boolean, write: () => Promise<unknown>) {
  const verb = exists ? 'actualizar' : 'crear';
  counts[verb] += 1;
  if (DRY) {
    console.log(`  [dry] ${exists ? '~' : '+'} ${verb} ${kind}: ${label}`);
    return;
  }
  await write();
  console.log(`  ${exists ? '~' : '+'} ${kind}: ${label}`);
}

/** Toda fila que ya exista con un id de la demo tiene que colgar de la demo. */
function guard(kind: string, id: string, ok: boolean, why: string) {
  if (!ok) fail(`${kind} ${id} ya existe y ${why}. No se toca nada.`);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Organización
// ─────────────────────────────────────────────────────────────────────────────

async function ensureOrganization() {
  if (DEMO_ORG_ID === DEFAULT_ORG_ID) fail('El id de la demo coincide con la organización de Arta.');
  const [byId, bySlug] = await Promise.all([
    db.organization.findUnique({
      where: { id: DEMO_ORG_ID },
      select: { id: true, slug: true, settingsJson: true },
    }),
    db.organization.findUnique({ where: { slug: DEMO_ORG_SLUG }, select: { id: true } }),
  ]);
  if (bySlug && bySlug.id !== DEMO_ORG_ID) {
    fail(`El slug ${DEMO_ORG_SLUG} lo tiene otra organización (${bySlug.id}). No se toca.`);
  }
  if (byId) {
    guard('Organización', DEMO_ORG_ID, byId.slug === DEMO_ORG_SLUG, `tiene el slug «${byId.slug}»`);
    guard('Organización', DEMO_ORG_ID, asObject(byId.settingsJson)[DEMO_MARKER] === true, `no lleva la marca ${DEMO_MARKER}`);
  }

  const settingsJson = {
    ...asObject(byId?.settingsJson),
    entities: ALL_ENTITIES,
    // El revisor no puede resolver un TOTP: la política de la demo es «sin 2FA obligatorio».
    require2fa: false,
    [DEMO_MARKER]: true,
    // Días de cobro apagados: en la demo se puede marcar pagado cualquier día.
    poWindow: { ...DEFAULT_PO_WINDOW, days: [...DEFAULT_PO_WINDOW.days], enabled: false, note: '' },
  } as Prisma.InputJsonValue;

  await step('organización', `${DEMO_ORG_NAME} (${DEMO_ORG_SLUG})`, !!byId, () =>
    db.organization.upsert({
      where: { id: DEMO_ORG_ID },
      create: { id: DEMO_ORG_ID, slug: DEMO_ORG_SLUG, name: DEMO_ORG_NAME, plan: 'OPS', active: true, settingsJson },
      update: { name: DEMO_ORG_NAME, plan: 'OPS', active: true, settingsJson },
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Personas
// ─────────────────────────────────────────────────────────────────────────────

type PersonKey = 'reviewer' | 'lucia' | 'mateo' | 'valeria';
type Person = { key: PersonKey; id: string; email: string; fullName: string };

const TEAM: Array<{ key: Exclude<PersonKey, 'reviewer'>; email: string; fullName: string; title: string; roleKey: RoleKey }> = [
  // Ningún compañero ficticio es de dirección: el digest diario se manda por correo a dirección.
  { key: 'lucia', email: 'lucia.mendez@example.com', fullName: 'Lucía Méndez Arriaga', title: 'Producción ejecutiva', roleKey: ROLES.LOGISTICA },
  { key: 'mateo', email: 'mateo.rios@example.com', fullName: 'Mateo Ríos Calderón', title: 'Coordinación técnica', roleKey: ROLES.LOGISTICA },
  { key: 'valeria', email: 'valeria.ortega@example.com', fullName: 'Valeria Ortega Luna', title: 'Convenios y patrocinios', roleKey: ROLES.CONVENIOS },
];

async function assertNoForeignMemberships(userId: string, email: string) {
  const strays = await db.orgMembership.count({ where: { userId, NOT: { organizationId: DEMO_ORG_ID } } });
  if (strays > 0) fail(`${email} tiene ${strays} membresía(s) en otra organización. Revísalo a mano; no se toca.`);
}

async function ensureMembership(person: Person, roleKey: string, existed: boolean) {
  if (existed) await assertNoForeignMemberships(person.id, person.email);
  const existing = existed
    ? await db.orgMembership.findUnique({
        where: { organizationId_userId: { organizationId: DEMO_ORG_ID, userId: person.id } },
        select: { id: true },
      })
    : null;
  await step('membresía', `${person.email} → ${DEMO_ORG_SLUG} (${roleKey})`, !!existing, () =>
    db.orgMembership.upsert({
      where: { organizationId_userId: { organizationId: DEMO_ORG_ID, userId: person.id } },
      create: { organizationId: DEMO_ORG_ID, userId: person.id, roleKey },
      update: { roleKey },
    }),
  );
}

async function ensureTeammate(seed: (typeof TEAM)[number]): Promise<Person> {
  const plannedId = demoId(`user:${seed.key}`);
  const existing = await db.user.findUnique({
    where: { email: seed.email },
    select: { id: true, organizationId: true },
  });
  if (existing) {
    guard('Usuario', seed.email, existing.organizationId === DEMO_ORG_ID, `pertenece a ${existing.organizationId ?? DEFAULT_ORG_ID}`);
  } else {
    const idTaken = await db.user.findUnique({ where: { id: plannedId }, select: { email: true } });
    guard('Usuario', plannedId, !idTaken, `tiene otro correo (${idTaken?.email})`);
  }
  const person: Person = { key: seed.key, id: existing?.id ?? plannedId, email: seed.email, fullName: seed.fullName };
  const profile = {
    fullName: seed.fullName,
    title: seed.title,
    roleKey: seed.roleKey,
    entities: ALL_ENTITIES,
    permissions: [] as string[],
    organizationId: DEMO_ORG_ID,
    active: true,
    phone: null,
  };
  await step('compañero ficticio', `${seed.fullName} <${seed.email}> (${seed.roleKey})`, !!existing, async () => {
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: profile });
      return;
    }
    await db.user.create({
      data: {
        id: plannedId,
        email: seed.email,
        // Contraseña aleatoria que nadie conoce: la cuenta existe para el chat y las tareas, no para entrar.
        passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), BCRYPT_ROUNDS),
        ...profile,
      },
    });
  });
  await ensureMembership(person, seed.roleKey, !!existing);
  return person;
}

async function ensureReviewer(email: string, password: string): Promise<{ person: Person; passwordChanged: boolean }> {
  const plannedId = demoId('user:reviewer');
  const [byEmail, byId] = await Promise.all([
    db.user.findUnique({ where: { email }, select: { id: true, organizationId: true, passwordHash: true } }),
    db.user.findUnique({ where: { id: plannedId }, select: { id: true, email: true, organizationId: true, passwordHash: true } }),
  ]);
  if (byEmail) {
    guard('Usuario', email, byEmail.organizationId === DEMO_ORG_ID, `pertenece a ${byEmail.organizationId ?? DEFAULT_ORG_ID} (usa otro STORE_REVIEWER_EMAIL)`);
  }
  if (byId) {
    guard('Usuario', plannedId, byId.organizationId === DEMO_ORG_ID, `pertenece a ${byId.organizationId ?? DEFAULT_ORG_ID}`);
  }
  if (byEmail && byId && byEmail.id !== byId.id) {
    fail(`Hay dos cuentas de revisión en la demo (${byId.email} y ${email}). Desactiva una a mano.`);
  }
  // Mismo revisor con otro correo (cambió STORE_REVIEWER_EMAIL): se renombra en vez de duplicar.
  const current = byEmail ?? byId;
  const id = current?.id ?? plannedId;

  const samePassword = current ? await bcrypt.compare(password, current.passwordHash) : false;
  const passwordChanged = !samePassword;
  const openSessions = current && passwordChanged
    ? await db.userSession.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: NOW } } })
    : 0;

  const profile = {
    email,
    fullName: REVIEWER_NAME,
    title: REVIEWER_TITLE,
    phone: null,
    roleKey: REVIEWER_ROLE,
    entities: ALL_ENTITIES,
    permissions: [...REVIEWER_EXTRA_PERMISSIONS] as string[],
    organizationId: DEMO_ORG_ID,
    active: true,
    // Un revisor no resuelve un TOTP, y un candado por intentos fallidos tumba la revisión.
    failedLoginCount: 0,
    lockedUntil: null,
    totpEnabled: false,
    totpSecret: null,
    totpVerifiedAt: null,
    chatDndUntil: null,
  };

  const renamed = byId && !byEmail ? ` (antes ${byId.email})` : '';
  const pwLabel = !current ? 'contraseña nueva' : passwordChanged ? 'contraseña CAMBIA' : 'contraseña igual a la guardada';
  await step(
    'revisor',
    `${email}${renamed} · ${REVIEWER_ROLE} + ${REVIEWER_EXTRA_PERMISSIONS.join(', ')} · 2FA apagado · ${pwLabel}`,
    !!current,
    async () => {
      const passwordHash = passwordChanged ? await bcrypt.hash(password, BCRYPT_ROUNDS) : undefined;
      if (current) {
        await db.user.update({ where: { id }, data: { ...profile, ...(passwordHash ? { passwordHash } : {}) } });
      } else {
        await db.user.create({ data: { id, ...profile, passwordHash: passwordHash! } });
      }
    },
  );

  if (openSessions > 0) {
    if (DRY) {
      console.log(`  [dry] ! revocar ${openSessions} sesión(es) abierta(s) del revisor (la contraseña cambia)`);
    } else {
      const res = await db.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: NOW },
      });
      console.log(`  ! ${res.count} sesión(es) del revisor revocada(s): la contraseña cambió`);
    }
  }

  const person: Person = { key: 'reviewer', id, email, fullName: REVIEWER_NAME };
  await ensureMembership(person, REVIEWER_ROLE, !!current);
  return { person, passwordChanged };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eventos, corridas, OC y anticipo
// ─────────────────────────────────────────────────────────────────────────────

type EventKey = 'boleros' | 'sabores' | 'volcanes';
type DemoEvent = { key: EventKey; id: string; entity: EntityKey; name: string; artist: string; startsAt: Date };

async function ensureEvents(people: Record<PersonKey, Person>): Promise<Record<EventKey, DemoEvent>> {
  const today = todayLocal();
  const specs: Array<{
    key: EventKey;
    entity: EntityKey;
    name: string;
    artist: string;
    promoter: string;
    venue: string;
    city: string;
    inDays: number;
    hh: number;
    mm: number;
    hours: number;
    schedule: string;
    functions: number;
    description: string;
    notes: string;
  }> = [
    {
      key: 'boleros',
      entity: 'ARTA',
      name: 'Noche de Boleros',
      artist: 'Trío Luna de Plata',
      promoter: 'Promotora Angelópolis (demo)',
      venue: 'Foro Jardín Quetzal',
      city: 'San Andrés Cholula, Puebla',
      inDays: 5,
      hh: 20,
      mm: 30,
      hours: 3,
      schedule: '18:00 a 23:30',
      functions: 1,
      description: 'Concierto íntimo de boleros clásicos con mesas para 400 personas.',
      notes: 'Prueba de sonido a las 16:00. Acceso de proveedores por la calle lateral.',
    },
    {
      key: 'sabores',
      entity: 'ARTA',
      name: 'Festival Sabores del Valle',
      artist: 'Varios artistas',
      promoter: 'Arta Demo',
      venue: 'Explanada Jardines del Alba',
      city: 'Puebla, Puebla',
      inDays: 12,
      hh: 12,
      mm: 0,
      hours: 10,
      schedule: '12:00 a 22:00',
      functions: 2,
      description: 'Festival gastronómico con escenario de música en vivo y 30 expositores.',
      notes: 'Montaje de carpas el día anterior desde las 8:00.',
    },
    {
      key: 'volcanes',
      entity: 'EXPLANADA',
      name: 'Eco de Volcanes · Gira 2026',
      artist: 'Eco de Volcanes',
      promoter: 'Producciones Sierra Norte (demo)',
      venue: 'Auditorio Bosque Azul',
      city: 'Puebla, Puebla',
      inDays: 26,
      hh: 21,
      mm: 0,
      hours: 2.5,
      schedule: '19:00 a 23:30',
      functions: 1,
      description: 'Concierto de rock en español; aforo de 3,500 personas.',
      notes: 'Rueda de prensa una semana antes en el lobby del auditorio.',
    },
  ];

  const out = {} as Record<EventKey, DemoEvent>;
  for (const s of specs) {
    const id = demoId(`event:${s.key}`);
    const startsAt = atLocal(plusDays(today, s.inDays), s.hh, s.mm);
    const existing = await db.event.findUnique({ where: { id }, select: { organizationId: true } });
    if (existing) guard('Evento', id, existing.organizationId === DEMO_ORG_ID, `pertenece a ${existing.organizationId}`);
    const data = {
      organizationId: DEMO_ORG_ID,
      entity: s.entity,
      name: s.name,
      artist: s.artist,
      promoter: s.promoter,
      venue: s.venue,
      city: s.city,
      startsAt,
      endsAt: plusMs(startsAt, s.hours * 3_600_000),
      status: 'ACTIVE' as const,
      campaignType: 'NONE' as const,
      notes: s.notes,
      description: s.description,
      schedule: s.schedule,
      functions: s.functions,
      createdById: people.lucia.id,
    };
    await step('evento', `${s.entity} · ${s.name} · ${ymd(plusDays(today, s.inDays))} · ${s.venue}`, !!existing, () =>
      db.event.upsert({ where: { id }, create: { id, ...data, createdAt: ago(3 * 24 * 60) }, update: data }),
    );
    out[s.key] = { key: s.key, id, entity: s.entity, name: s.name, artist: s.artist, startsAt };

    // Corrida vacía, como la que crea el alta de evento. Solo se crea: tiene
    // revisiones (DocRevision) y reiniciar su contador chocaría con ellas.
    const financeId = demoId(`finance:${s.key}`);
    const finance = await db.financeRun.findUnique({ where: { id: financeId }, select: { eventId: true } });
    if (finance) {
      guard('Corrida', financeId, finance.eventId === id, 'cuelga de otro evento');
    } else {
      await step('corrida financiera', s.name, false, () =>
        db.financeRun.create({
          data: {
            id: financeId,
            eventId: id,
            title: 'Corrida financiera',
            dataJson: { rows: [], totalIncome: 0, totalExpense: 0 },
            createdById: people.lucia.id,
          },
        }),
      );
    }
  }
  return out;
}

type DemoOrder = { id: string; vendorName: string; amount: number; event: DemoEvent };

async function ensurePurchaseOrders(people: Record<PersonKey, Person>, events: Record<EventKey, DemoEvent>) {
  const specs = [
    {
      key: 'audio-boleros',
      event: events.boleros,
      rubro: 'audio',
      vendorName: 'Sonido Quetzal Pro',
      description: 'Audio para la Noche de Boleros: consola, sistema principal y técnicos.',
      status: 'PENDING_AUTH' as const,
      withIva: true,
      createdBy: people.mateo,
      createdAt: ago(5 * 60),
      authorizedBy: null as Person | null,
      authorizedAt: null as Date | null,
      lines: [
        { concept: 'Renta de consola digital de 32 canales', qty: 1, unitPrice: 9500 },
        { concept: 'Sistema de sonido principal (line array)', qty: 1, unitPrice: 18000 },
        { concept: 'Técnico de audio (jornada)', qty: 2, unitPrice: 2500 },
      ],
    },
    {
      key: 'catering-sabores',
      event: events.sabores,
      rubro: 'catering',
      vendorName: 'Banquetes La Cazuela Azul',
      description: 'Comidas del staff y artistas durante el montaje y el festival.',
      status: 'AUTHORIZED' as const,
      withIva: false,
      createdBy: people.mateo,
      createdAt: ago(2 * 24 * 60),
      authorizedBy: people.reviewer,
      authorizedAt: ago(26 * 60),
      lines: [
        { concept: 'Comida para staff y artistas (60 personas)', qty: 60, unitPrice: 180 },
        { concept: 'Coffee break de montaje', qty: 1, unitPrice: 2000 },
      ],
    },
  ];

  const out: Record<string, DemoOrder> = {};
  for (const s of specs) {
    const id = demoId(`po:${s.key}`);
    const existing = await db.purchaseOrder.findUnique({ where: { id }, select: { eventId: true } });
    if (existing) guard('Orden de compra', id, existing.eventId === s.event.id, 'cuelga de otro evento');
    const subtotal = s.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
    const amount = round2(subtotal * (s.withIva ? 1 + IVA : 1));
    const data = {
      eventId: s.event.id,
      rubro: s.rubro,
      vendorName: s.vendorName,
      description: s.description,
      amount,
      currency: 'MXN',
      status: s.status,
      paymentMethod: 'TRANSFERENCIA' as const,
      payeeType: 'PROVEEDOR',
      withIva: s.withIva,
      createdById: s.createdBy.id,
      authorizedById: s.authorizedBy?.id ?? null,
      authorizedAt: s.authorizedAt,
      paidAt: null,
      createdAt: s.createdAt,
    };
    await step('orden de compra', `${s.vendorName} · ${mxn(amount)} · ${s.status} · ${s.event.name}`, !!existing, () =>
      db.purchaseOrder.upsert({ where: { id }, create: { id, ...data }, update: data }),
    );

    const lineIds: string[] = [];
    for (const [i, l] of s.lines.entries()) {
      const lineId = demoId(`po-line:${s.key}:${i}`);
      lineIds.push(lineId);
      const line = await db.purchaseOrderLine.findUnique({ where: { id: lineId }, select: { orderId: true } });
      if (line) guard('Partida de OC', lineId, line.orderId === id, 'es de otra orden');
      const lineData = { orderId: id, concept: l.concept, qty: l.qty, unitPrice: l.unitPrice, total: round2(l.qty * l.unitPrice) };
      await step('partida', `${l.concept} (${l.qty} × ${mxn(l.unitPrice)})`, !!line, () =>
        db.purchaseOrderLine.upsert({ where: { id: lineId }, create: { id: lineId, ...lineData }, update: lineData }),
      );
    }
    // Si el revisor editó la OC, sus partidas nuevas sobran: la demo vuelve a las suyas.
    if (existing) {
      const extra = await db.purchaseOrderLine.count({ where: { orderId: id, id: { notIn: lineIds } } });
      if (extra > 0) {
        counts.borrar += extra;
        if (DRY) console.log(`  [dry] - borrar ${extra} partida(s) ajena(s) de ${s.vendorName}`);
        else {
          await db.purchaseOrderLine.deleteMany({ where: { orderId: id, id: { notIn: lineIds } } });
          console.log(`  - ${extra} partida(s) ajena(s) de ${s.vendorName} borrada(s)`);
        }
      }
    }
    out[s.key] = { id, vendorName: s.vendorName, amount, event: s.event };
  }
  return out;
}

async function ensureAdvance(people: Record<PersonKey, Person>, events: Record<EventKey, DemoEvent>) {
  const id = demoId('advance:hospedaje-boleros');
  const demoEventIds = Object.values(events).map((e) => e.id);
  const existing = await db.paymentProof.findUnique({ where: { id }, select: { eventId: true, purchaseOrderId: true } });
  if (existing) {
    guard('Anticipo', id, !!existing.eventId && demoEventIds.includes(existing.eventId) && !existing.purchaseOrderId, 'no es un anticipo de la demo');
  }
  const amount = 8400;
  const label = 'Anticipo de hospedaje';
  const data = {
    purchaseOrderId: null,
    eventId: events.boleros.id,
    label,
    fileUrl: null,
    amount,
    // Lo pide otra persona: `advances/pending` nunca le muestra a nadie lo que pidió él mismo.
    uploadedById: people.valeria.id,
    createdAt: ago(35),
    advanceStatus: 'PENDING' as const,
    note: 'Reservar 4 habitaciones para el trío y su staff (2 noches).',
    decidedById: null,
    decidedAt: null,
    rejectReason: null,
    paidById: null,
    paidAt: null,
    paidProofUrl: null,
  };
  await step('anticipo', `${label} · ${mxn(amount)} · PENDIENTE · ${events.boleros.name}`, !!existing, () =>
    db.paymentProof.upsert({ where: { id }, create: { id, ...data }, update: data }),
  );
  return { id, label, amount, event: events.boleros };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tareas
// ─────────────────────────────────────────────────────────────────────────────

type DemoTask = { id: string; title: string; event: DemoEvent | null };

async function ensureTasks(people: Record<PersonKey, Person>, events: Record<EventKey, DemoEvent>) {
  const today = todayLocal();
  const { reviewer, lucia, mateo } = people;
  const specs: Array<{
    key: string;
    title: string;
    detail: string;
    event: DemoEvent | null;
    assignee: Person;
    createdBy: Person;
    status: TaskStatus;
    dueAt: Date;
    createdAt: Date;
    submittedAt?: Date;
    completionNote?: string;
    approvedAt?: Date;
  }> = [
    {
      key: 'rider',
      title: 'Confirmar el rider técnico con el Trío Luna de Plata',
      detail: 'Pedir al manager la versión final del rider (audio y backline) y adjuntarla al evento.',
      event: events.boleros,
      assignee: reviewer,
      createdBy: lucia,
      status: 'OPEN',
      dueAt: atLocal(today, 23, 0),
      createdAt: ago(2 * 60 + 5),
    },
    {
      key: 'transporte',
      title: 'Cotizar transporte para el equipo técnico',
      detail: 'Dos camionetas para 12 personas, del hotel al recinto, ambos días del festival.',
      event: events.sabores,
      assignee: reviewer,
      createdBy: lucia,
      status: 'IN_PROGRESS',
      dueAt: atLocal(plusDays(today, 3), 14, 0),
      createdAt: ago(28 * 60),
    },
    {
      key: 'plano',
      title: 'Enviar el plano de escenario al recinto',
      detail: 'El recinto necesita el plano con medidas y tomas de corriente antes del montaje.',
      event: events.boleros,
      assignee: reviewer,
      createdBy: lucia,
      status: 'PENDING_APPROVAL',
      dueAt: atLocal(plusDays(today, 1), 12, 0),
      createdAt: ago(30 * 60),
      submittedAt: ago(3 * 60),
      completionNote: 'Plano revisado con el recinto; queda la versión final.',
    },
    {
      key: 'semana',
      title: 'Revisar los pendientes de la semana con producción',
      detail: 'Repasar fechas de montaje y proveedores de los tres eventos.',
      event: null,
      assignee: reviewer,
      createdBy: lucia,
      status: 'OPEN',
      dueAt: atLocal(plusDays(today, 1), 10, 0),
      createdAt: ago(20 * 60),
    },
    {
      key: 'medios',
      title: 'Cerrar la lista de medios para la rueda de prensa',
      detail: 'Confirmar asistencia de medios y mandar la lista a la gira.',
      event: events.volcanes,
      assignee: mateo,
      createdBy: reviewer,
      status: 'PENDING_APPROVAL',
      dueAt: atLocal(plusDays(today, 2), 18, 0),
      createdAt: ago(2 * 24 * 60),
      submittedAt: ago(70),
      completionNote: 'Lista cerrada: 35 medios confirmados.',
    },
    {
      key: 'hospedaje',
      title: 'Reservar hospedaje para el trío',
      detail: 'Cuatro habitaciones, dos noches, cerca del recinto.',
      event: events.boleros,
      assignee: mateo,
      createdBy: reviewer,
      status: 'DONE',
      dueAt: atLocal(plusDays(today, -1), 18, 0),
      createdAt: ago(3 * 24 * 60),
      submittedAt: ago(26 * 60),
      completionNote: 'Reservadas 4 habitaciones en el hotel sede.',
      approvedAt: ago(24 * 60),
    },
  ];

  const out: Record<string, DemoTask> = {};
  for (const s of specs) {
    const id = demoId(`task:${s.key}`);
    const existing = await db.taskAssignment.findUnique({ where: { id }, select: { organizationId: true } });
    if (existing) guard('Tarea', id, existing.organizationId === DEMO_ORG_ID, `pertenece a ${existing.organizationId}`);
    const data = {
      eventId: s.event?.id ?? null,
      organizationId: DEMO_ORG_ID,
      assigneeId: s.assignee.id,
      createdById: s.createdBy.id,
      title: s.title,
      module: null,
      detail: s.detail,
      status: s.status,
      dueAt: s.dueAt,
      // Sin abrir: la tarjeta sale como nueva hasta que el revisor abre «Mis tareas».
      seenAt: s.assignee.key === 'reviewer' ? null : s.createdAt,
      submittedAt: s.submittedAt ?? null,
      completionNote: s.completionNote ?? null,
      approvedById: s.approvedAt ? s.createdBy.id : null,
      approvedAt: s.approvedAt ?? null,
      rejectedById: null,
      rejectedAt: null,
      rejectionNote: null,
      createdAt: s.createdAt,
    };
    await step('tarea', `[${s.status}] ${s.title} → ${s.assignee.fullName}`, !!existing, () =>
      db.taskAssignment.upsert({ where: { id }, create: { id, ...data }, update: data }),
    );
    out[s.key] = { id, title: s.title, event: s.event };

    // Historial de la tarea, con las mismas acciones que escribe tasks.controller.
    const acts: Array<{ actor: Person; action: string; detail?: string; meta?: Prisma.InputJsonValue; at: Date }> = [
      {
        actor: s.createdBy,
        action: 'created',
        detail: s.title,
        meta: { assigneeId: s.assignee.id, assigneeIds: [s.assignee.id], eventId: s.event?.id ?? null },
        at: s.createdAt,
      },
      { actor: s.createdBy, action: 'assigned', detail: s.assignee.fullName, at: plusMs(s.createdAt, 1000) },
    ];
    if (s.status === 'IN_PROGRESS') {
      acts.push({ actor: s.assignee, action: 'status_changed', detail: 'IN_PROGRESS', meta: { from: 'OPEN', to: 'IN_PROGRESS' }, at: ago(5 * 60) });
    }
    if (s.submittedAt) {
      acts.push({
        actor: s.assignee,
        action: 'submitted',
        detail: s.completionNote,
        meta: { status: 'PENDING_APPROVAL', evidenceCount: 0 },
        at: s.submittedAt,
      });
    }
    if (s.approvedAt) acts.push({ actor: s.createdBy, action: 'approved', meta: { status: 'DONE' }, at: s.approvedAt });

    for (const [i, a] of acts.entries()) {
      const actId = demoId(`task-activity:${s.key}:${i}`);
      const act = await db.taskActivity.findUnique({ where: { id: actId }, select: { taskId: true } });
      if (act) guard('Actividad', actId, act.taskId === id, 'es de otra tarea');
      const actData = { taskId: id, actorId: a.actor.id, action: a.action, detail: a.detail ?? null, metaJson: a.meta ?? Prisma.DbNull, createdAt: a.at };
      await step('historial', `${s.key} · ${a.action}`, !!act, () =>
        db.taskActivity.upsert({ where: { id: actId }, create: { id: actId, ...actData }, update: actData }),
      );
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Avisos y calendario
// ─────────────────────────────────────────────────────────────────────────────

async function ensureNotifications(
  people: Record<PersonKey, Person>,
  events: Record<EventKey, DemoEvent>,
  tasks: Record<string, DemoTask>,
  orders: Record<string, DemoOrder>,
  advance: { id: string; label: string; amount: number; event: DemoEvent },
) {
  const { reviewer, lucia, mateo, valeria } = people;
  const po = orders['audio-boleros'];
  const specs: Array<{ key: string; actor: Person; type: string; title: string; body: string; linkUrl: string; entity: EntityKey | null; at: Date; read: boolean }> = [
    {
      key: 'advance',
      actor: valeria,
      type: 'advance.requested',
      title: `${shortName(valeria.fullName)} pidió un anticipo`,
      body: `${advance.label} · ${mxn(advance.amount)} · ${advance.event.name}`,
      linkUrl: `/advances?advance=${advance.id}`,
      entity: advance.event.entity,
      at: ago(35),
      read: false,
    },
    {
      key: 'task-submitted',
      actor: mateo,
      type: 'task.submitted',
      title: `${mateo.fullName} entregó una tarea para tu revisión`,
      body: `${tasks.medios.title} · ${events.volcanes.name}`,
      linkUrl: taskLink(events.volcanes.id, tasks.medios.id),
      entity: events.volcanes.entity,
      at: ago(70),
      read: false,
    },
    {
      key: 'task-assigned-rider',
      actor: lucia,
      type: 'task.assigned',
      title: `${lucia.fullName} te asignó una tarea`,
      body: `${tasks.rider.title} · ${events.boleros.name}`,
      linkUrl: taskLink(events.boleros.id, tasks.rider.id),
      entity: events.boleros.entity,
      at: ago(2 * 60 + 5),
      read: false,
    },
    {
      key: 'po',
      actor: mateo,
      type: 'po.requested',
      title: `${mateo.fullName} pidió una orden de compra`,
      body: `${po.vendorName} · ${mxn(po.amount)} · ${po.event.name}`,
      linkUrl: `/purchase-orders?po=${po.id}`,
      entity: po.event.entity,
      at: ago(5 * 60),
      read: false,
    },
    {
      key: 'task-assigned-transporte',
      actor: lucia,
      type: 'task.assigned',
      title: `${lucia.fullName} te asignó una tarea`,
      body: `${tasks.transporte.title} · ${events.sabores.name}`,
      linkUrl: taskLink(events.sabores.id, tasks.transporte.id),
      entity: events.sabores.entity,
      at: ago(28 * 60),
      read: true,
    },
    {
      key: 'event-created',
      actor: lucia,
      type: 'event.created',
      title: `${shortName(lucia.fullName)} creó un evento`,
      body: `${events.volcanes.name} · ${whenLabel(events.volcanes.startsAt)}`,
      linkUrl: `/events/${events.volcanes.id}`,
      entity: events.volcanes.entity,
      at: ago(3 * 24 * 60),
      read: true,
    },
  ];

  for (const s of specs) {
    const id = demoId(`notification:${s.key}`);
    const existing = await db.notification.findUnique({ where: { id }, select: { organizationId: true, userId: true } });
    if (existing) {
      guard('Aviso', id, existing.organizationId === DEMO_ORG_ID && existing.userId === reviewer.id, 'es de otra persona u organización');
    }
    const data = {
      userId: reviewer.id,
      organizationId: DEMO_ORG_ID,
      type: s.type,
      title: s.title,
      body: s.body,
      linkUrl: s.linkUrl,
      actorId: s.actor.id,
      entity: s.entity,
      readAt: s.read ? plusMs(s.at, 10 * 60_000) : null,
      createdAt: s.at,
    };
    await step('aviso', `${s.read ? 'leído' : 'NUEVO'} · ${s.title}`, !!existing, () =>
      db.notification.upsert({ where: { id }, create: { id, ...data }, update: data }),
    );
  }
}

async function ensureCalendarNotes(people: Record<PersonKey, Person>) {
  const today = todayLocal();
  const specs = [
    { key: 'prueba-sonido', entity: 'ARTA' as EntityKey, day: plusDays(today, 5), text: 'Prueba de sonido 16:00 · llevar el plano de escenario impreso.', by: people.lucia },
    { key: 'montaje-auditorio', entity: 'EXPLANADA' as EntityKey, day: plusDays(today, 25), text: 'Montaje desde las 9:00; carga por la puerta norte.', by: people.mateo },
  ];
  for (const s of specs) {
    const id = demoId(`calendar-note:${s.key}`);
    const existing = await db.calendarNote.findUnique({ where: { id }, select: { organizationId: true } });
    if (existing) guard('Nota de calendario', id, existing.organizationId === DEMO_ORG_ID, `pertenece a ${existing.organizationId}`);
    const data = { organizationId: DEMO_ORG_ID, entity: s.entity, date: ymd(s.day), text: s.text, createdById: s.by.id, updatedById: s.by.id };
    await step('nota de calendario', `${ymd(s.day)} · ${s.text}`, !!existing, () =>
      db.calendarNote.upsert({ where: { id }, create: { id, ...data }, update: data }),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────────────────────────────────────

type ChannelSeed = {
  key: string;
  label: string;
  /** Id real del canal, o el planeado si aún no existe (en --dry no se crea). */
  id: string;
  exists: boolean;
};

async function ensureChannel(
  key: string,
  label: string,
  lookup: () => Promise<{ id: string; organizationId: string } | null>,
  create: (id: string) => Prisma.ChatChannelUncheckedCreateInput,
  update: Prisma.ChatChannelUncheckedUpdateInput,
): Promise<ChannelSeed> {
  const found = await lookup();
  if (found) guard('Canal', found.id, found.organizationId === DEMO_ORG_ID, `pertenece a ${found.organizationId}`);
  const id = found?.id ?? demoId(`chat-channel:${key}`);
  if (!found) {
    const taken = await db.chatChannel.findUnique({ where: { id }, select: { organizationId: true } });
    guard('Canal', id, !taken, `ya existe en ${taken?.organizationId}`);
  }
  await step('canal', label, !!found, () =>
    found
      ? db.chatChannel.update({ where: { id }, data: update })
      : db.chatChannel.create({ data: create(id) }),
  );
  return { key, label, id, exists: !!found };
}

async function ensureMember(channel: ChannelSeed, person: Person, opts: { role?: string; lastReadAt: Date | null }) {
  const existing = channel.exists
    ? await db.chatChannelMember.findUnique({
        where: { channelId_userId: { channelId: channel.id, userId: person.id } },
        select: { id: true },
      })
    : null;
  await step('miembro', `${channel.label} · ${person.fullName}`, !!existing, () =>
    db.chatChannelMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId: person.id } },
      create: {
        channelId: channel.id,
        userId: person.id,
        role: opts.role ?? 'member',
        joinedAt: ago(30 * 24 * 60),
        lastReadAt: opts.lastReadAt,
      },
      update: { role: opts.role ?? 'member', lastReadAt: opts.lastReadAt, mutedUntil: null },
    }),
  );
}

type MessageSeed = {
  key: string;
  sender: Person;
  body: string;
  minutesAgo: number;
  kind?: ChatMessageKind;
  parentKey?: string;
  pinnedBy?: Person;
};

async function ensureMessages(channel: ChannelSeed, messages: MessageSeed[]): Promise<Record<string, { id: string; at: Date }>> {
  const out: Record<string, { id: string; at: Date }> = {};
  for (const m of messages) {
    const id = demoId(`chat-message:${channel.key}:${m.key}`);
    const at = ago(m.minutesAgo);
    const existing = await db.chatMessage.findUnique({ where: { id }, select: { channelId: true, organizationId: true } });
    if (existing) guard('Mensaje', id, existing.channelId === channel.id && existing.organizationId === DEMO_ORG_ID, 'es de otro canal');
    const parentId = m.parentKey ? out[m.parentKey]?.id ?? null : null;
    const data = {
      organizationId: DEMO_ORG_ID,
      channelId: channel.id,
      senderId: m.sender.id,
      recipientId: null,
      parentId,
      replyToId: null,
      kind: m.kind ?? ChatMessageKind.TEXT,
      body: m.body,
      attachmentUrl: null,
      attachmentName: null,
      attachmentMime: null,
      attachmentSize: null,
      pinnedAt: m.pinnedBy ? plusMs(at, 60_000) : null,
      pinnedById: m.pinnedBy?.id ?? null,
      editedAt: null,
      deletedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    await step('mensaje', `${channel.label} · ${m.sender.fullName}: ${preview(m.body, 60)}`, !!existing, () =>
      db.chatMessage.upsert({ where: { id }, create: { id, ...data }, update: data }),
    );
    out[m.key] = { id, at };
  }
  return out;
}

/**
 * Lo que se escribió después en el canal (el video de App Review manda «Listo, reviso el rider hoy.» en
 * cada corrida; un revisor, lo que pruebe) se borra: cada revisión empieza con la misma conversación.
 * Reacciones, lecturas y reportes de esos mensajes caen en cascada; las citas quedan en null.
 */
async function purgeUnseededMessages(channel: ChannelSeed, seeded: Record<string, { id: string; at: Date }>) {
  const where = { organizationId: DEMO_ORG_ID, channelId: channel.id, id: { notIn: Object.values(seeded).map((m) => m.id) } };
  const extra = await db.chatMessage.count({ where });
  if (!extra) return;
  counts.borrar += extra;
  if (DRY) {
    console.log(`  [dry] - borrar ${extra} mensaje(s) fuera de la demo en ${channel.label}`);
    return;
  }
  await db.chatMessage.deleteMany({ where });
  console.log(`  - mensajes: ${extra} fuera de la demo en ${channel.label}`);
}

/** Vista previa del canal: solo si el último mensaje es de la demo (si el revisor escribió después, ya está bien). */
async function refreshChannelPreview(channel: ChannelSeed, seeded: Record<string, { id: string; at: Date }>, bodies: Record<string, string>) {
  if (DRY) return;
  const latest = await db.chatMessage.findFirst({
    where: { channelId: channel.id, deletedAt: null, parentId: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, createdAt: true },
  });
  if (!latest) return;
  const key = Object.keys(seeded).find((k) => seeded[k].id === latest.id);
  if (!key) return;
  await db.chatChannel.update({
    where: { id: channel.id },
    data: { lastMessageAt: latest.createdAt, lastMessagePreview: preview(bodies[key]) },
  });
}

async function ensureReaction(messageId: string, person: Person, emoji: string) {
  const existing = await db.chatMessageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: person.id, emoji } },
    select: { id: true },
  });
  if (existing) return;
  await step('reacción', `${emoji} de ${person.fullName}`, false, () =>
    db.chatMessageReaction.create({ data: { messageId, userId: person.id, emoji } }),
  );
}

async function ensureChat(people: Record<PersonKey, Person>, events: Record<EventKey, DemoEvent>) {
  const { reviewer, lucia, mateo, valeria } = people;
  const everyone = [reviewer, lucia, mateo, valeria];

  // #general y #anuncios: mismas filas que ChatService.ensureDefaults (que también los crea al primer login).
  const general = await ensureChannel(
    'general',
    '#general',
    () => db.chatChannel.findUnique({ where: { organizationId_slug: { organizationId: DEMO_ORG_ID, slug: 'general' } }, select: { id: true, organizationId: true } }),
    (id) => ({ id, organizationId: DEMO_ORG_ID, kind: ChatChannelKind.PUBLIC, slug: 'general', name: 'general', topic: 'Conversación del equipo', description: 'Canal abierto para toda la organización', postingRestricted: false }),
    { isArchived: false },
  );
  const announcements = await ensureChannel(
    'anuncios',
    '#anuncios',
    () => db.chatChannel.findUnique({ where: { organizationId_slug: { organizationId: DEMO_ORG_ID, slug: 'anuncios' } }, select: { id: true, organizationId: true } }),
    (id) => ({ id, organizationId: DEMO_ORG_ID, kind: ChatChannelKind.PUBLIC, slug: 'anuncios', name: 'anuncios', topic: 'Avisos importantes de dirección', description: 'Comunicados oficiales; solo dirección publica', postingRestricted: true }),
    { isArchived: false },
  );

  const boleros = events.boleros;
  const eventLabel = `${boleros.artist} · ${boleros.name}`.slice(0, 80);
  const eventChannel = await ensureChannel(
    'evento-boleros',
    `canal del evento «${eventLabel}»`,
    () => db.chatChannel.findUnique({ where: { eventId: boleros.id }, select: { id: true, organizationId: true } }),
    (id) => ({
      id,
      organizationId: DEMO_ORG_ID,
      kind: ChatChannelKind.PUBLIC,
      slug: `evento-${slugify(eventLabel, 40) || 'show'}-${boleros.id.slice(-6)}`,
      name: eventLabel,
      topic: 'Producción del evento',
      eventId: boleros.id,
      createdById: lucia.id,
    }),
    { isArchived: false, name: eventLabel },
  );

  const dmKey = dmKeyOf(reviewer.id, lucia.id);
  const direct = await ensureChannel(
    'dm-lucia',
    `directo ${reviewer.fullName} ↔ ${lucia.fullName}`,
    () => db.chatChannel.findUnique({ where: { organizationId_dmKey: { organizationId: DEMO_ORG_ID, dmKey } }, select: { id: true, organizationId: true } }),
    (id) => ({ id, organizationId: DEMO_ORG_ID, kind: ChatChannelKind.DIRECT, dmKey, name: 'Mensaje directo', topic: 'Mensaje directo', createdById: lucia.id }),
    { isArchived: false },
  );

  // Mensajes (los minutos son «hace N minutos»).
  const generalMsgs: MessageSeed[] = [
    { key: 'g1', sender: lucia, minutesAgo: 26 * 60, body: 'Buen día, equipo. Esta semana arrancamos el montaje de la Noche de Boleros; cualquier pendiente lo vemos por aquí.' },
    { key: 'g2', sender: mateo, minutesAgo: 25 * 60, body: 'Listo. Hoy confirmo con el recinto el horario de carga y descarga.' },
    { key: 'g3', sender: valeria, minutesAgo: 3 * 60, body: 'Ya quedó el convenio con la cafetería para el área de staff ☕' },
    { key: 'g4', sender: lucia, minutesAgo: 40, body: 'Gracias, Valeria. Recuerden subir sus entregas a las tareas antes del viernes.' },
  ];
  const announcementMsgs: MessageSeed[] = [
    { key: 'a1', sender: lucia, minutesAgo: 2 * 24 * 60, body: 'Calendario de octubre publicado: revisen sus fechas de montaje en Eventos.', pinnedBy: lucia },
  ];
  const eventMsgs: MessageSeed[] = [
    { key: 'e0', sender: lucia, minutesAgo: 30 * 60, kind: ChatMessageKind.SYSTEM, body: `${lucia.fullName} abrió el canal del evento` },
    { key: 'e1', sender: lucia, minutesAgo: 29 * 60, body: 'Aquí coordinamos todo lo de la Noche de Boleros. El trío llega el jueves a mediodía.', pinnedBy: lucia },
    { key: 'e2', sender: mateo, minutesAgo: 5 * 60, body: 'Ya tengo la cotización de audio; la subí como orden de compra para autorización.' },
    { key: 'e2r', sender: reviewer, minutesAgo: 4 * 60, parentKey: 'e2', body: 'Perfecto, la reviso en Aprobaciones.' },
    { key: 'e3', sender: valeria, minutesAgo: 30, body: 'Pedí el anticipo del hospedaje; queda pendiente de aprobación.' },
  ];
  const directMsgs: MessageSeed[] = [
    { key: 'd1', sender: lucia, minutesAgo: 120, body: 'Hola, ¿me ayudas a confirmar hoy el rider técnico del trío?' },
    { key: 'd2', sender: reviewer, minutesAgo: 110, body: 'Claro, le escribo al manager y te aviso.' },
    { key: 'd3', sender: lucia, minutesAgo: 100, body: 'Gracias. Si cambia algo del audio, avísale a Mateo.' },
    { key: 'd4', sender: lucia, minutesAgo: 15, body: '¿Pudiste hablar con el manager?' },
  ];

  const g = await ensureMessages(general, generalMsgs);
  const a = await ensureMessages(announcements, announcementMsgs);
  const e = await ensureMessages(eventChannel, eventMsgs);
  const d = await ensureMessages(direct, directMsgs);
  await purgeUnseededMessages(general, g);
  await purgeUnseededMessages(announcements, a);
  await purgeUnseededMessages(eventChannel, e);
  await purgeUnseededMessages(direct, d);

  // Leído hasta cierto punto: el revisor ve globos de no leídos en la lista de chats.
  for (const p of everyone) {
    await ensureMember(general, p, { lastReadAt: p.key === 'reviewer' ? g.g2.at : NOW });
    await ensureMember(announcements, p, { role: p.key === 'lucia' ? 'owner' : 'member', lastReadAt: NOW });
  }
  await ensureMember(eventChannel, lucia, { role: 'owner', lastReadAt: NOW });
  await ensureMember(eventChannel, mateo, { lastReadAt: NOW });
  await ensureMember(eventChannel, valeria, { lastReadAt: NOW });
  await ensureMember(eventChannel, reviewer, { lastReadAt: e.e2r.at });
  await ensureMember(direct, lucia, { lastReadAt: NOW });
  await ensureMember(direct, reviewer, { lastReadAt: d.d3.at });

  if (!DRY) {
    await ensureReaction(e.e2.id, lucia, '👍');
    await ensureReaction(g.g3.id, mateo, '🙌');
  }

  const bodies = (list: MessageSeed[]) => Object.fromEntries(list.map((m) => [m.key, m.body]));
  await refreshChannelPreview(general, g, bodies(generalMsgs));
  await refreshChannelPreview(announcements, a, bodies(announcementMsgs));
  await refreshChannelPreview(eventChannel, e, bodies(eventMsgs));
  await refreshChannelPreview(direct, d, bodies(directMsgs));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificación final
// ─────────────────────────────────────────────────────────────────────────────

async function verify(email: string, password: string): Promise<boolean> {
  const [user, org] = await Promise.all([
    db.user.findUnique({
      where: { email },
      select: {
        id: true,
        active: true,
        passwordHash: true,
        totpEnabled: true,
        totpSecret: true,
        lockedUntil: true,
        organizationId: true,
        roleKey: true,
        permissions: true,
      },
    }),
    db.organization.findUnique({ where: { id: DEMO_ORG_ID }, select: { active: true, settingsJson: true } }),
  ]);
  const checks: Array<[string, boolean]> = [
    ['el usuario existe y está activo', !!user?.active],
    ['la contraseña guardada coincide', !!user && (await bcrypt.compare(password, user.passwordHash))],
    ['sin TOTP propio (no pide código)', !!user && !user.totpEnabled && !user.totpSecret],
    ['sin candado por intentos', !!user && !user.lockedUntil],
    ['solo en la organización demo', user?.organizationId === DEMO_ORG_ID],
    ['la organización no exige 2FA', !!org && asObject(org.settingsJson).require2fa !== true],
    ['la organización está activa', !!org?.active],
    [`rol ${REVIEWER_ROLE} + ${REVIEWER_EXTRA_PERMISSIONS.join(',')}`, user?.roleKey === REVIEWER_ROLE && REVIEWER_EXTRA_PERMISSIONS.every((p) => user.permissions.includes(p))],
  ];
  console.log('\nVerificación en la base:');
  for (const [label, ok] of checks) console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${label}`);
  return checks.every(([, ok]) => ok);
}

// ─────────────────────────────────────────────────────────────────────────────
// Principal
// ─────────────────────────────────────────────────────────────────────────────

const HELP = `seed-store-reviewer — cuenta de revisión de tiendas en una organización demo aislada

  STORE_REVIEWER_PASSWORD=… [STORE_REVIEWER_EMAIL=…] npx ts-node --transpile-only prisma/seed-store-reviewer.ts [--dry] [--confirm-produccion]

  --dry                 solo muestra lo que crearía o actualizaría
  --confirm-produccion  obligatorio para escribir fuera de una base local (o con NODE_ENV=production)
`;

async function main() {
  const unknown = argv.filter((a) => !KNOWN_FLAGS.has(a));
  if (has('--help') || has('-h')) {
    console.log(HELP);
    return true;
  }
  if (unknown.length) fail(`Opción desconocida: ${unknown.join(' ')}\n${HELP}`);

  const password = readPassword();
  const email = readEmail();
  if (TEAM.some((t) => t.email === email)) fail('El correo del revisor coincide con el de un compañero ficticio.');
  assertReviewerAccess();

  const local = isLocalDb();
  if (!DRY && !local && !has('--confirm-produccion')) {
    fail('Base no local: corre primero con --dry y aplica con --confirm-produccion.');
  }

  const target = dbTarget(process.env.DATABASE_URL || '');
  console.log('Cuenta de revisión de tiendas · ARTA');
  console.log(`  base        : ${target ? `${target.host}:${target.port}/${target.db}` : '(DATABASE_URL ilegible)'}${local ? ' (local)' : ''}`);
  console.log(`  modo        : ${DRY ? 'DRY (no escribe nada)' : 'APLICAR'}`);
  console.log(`  organización: ${DEMO_ORG_NAME} · ${DEMO_ORG_SLUG} · ${DEMO_ORG_ID}`);
  console.log(`  revisor     : ${email} · rol ${REVIEWER_ROLE} + ${REVIEWER_EXTRA_PERMISSIONS.join(', ')}`);
  console.log('');

  // Solo lectura, en toda la base: con organizationId nulo, los avisos de OC,
  // anticipos y eventos se resuelven contra la gente de TODAS las organizaciones.
  const [orphanEvents, orphanUsers] = await Promise.all([
    db.event.count({ where: { organizationId: null } }),
    db.user.count({ where: { organizationId: null, active: true } }),
  ]);
  if (orphanEvents > 0 || orphanUsers > 0) {
    console.log(`  AVISO: ${orphanEvents} evento(s) y ${orphanUsers} usuario(s) activos sin organización.`);
    console.log('         Los avisos de esos eventos pueden llegarle a cualquier organización, incluida la demo.');
    console.log('         Asígnales organización antes de entregar la cuenta (este script no los toca).\n');
  }

  const seedAll = async (): Promise<boolean> => {
    await ensureOrganization();
    const team = {} as Record<PersonKey, Person>;
    for (const t of TEAM) team[t.key] = await ensureTeammate(t);
    const { person: reviewer, passwordChanged } = await ensureReviewer(email, password);
    team.reviewer = reviewer;

    const events = await ensureEvents(team);
    const orders = await ensurePurchaseOrders(team, events);
    const advance = await ensureAdvance(team, events);
    const tasks = await ensureTasks(team, events);
    await ensureNotifications(team, events, tasks, orders, advance);
    await ensureCalendarNotes(team);
    await ensureChat(team, events);

    if (!DRY) {
      await db.auditLog.create({
        data: {
          organizationId: DEMO_ORG_ID,
          action: 'store_review.seed',
          resource: 'Organization',
          resourceId: DEMO_ORG_ID,
          metaJson: { reviewerEmail: email, passwordChanged, ...counts },
        },
      });
    }
    return passwordChanged;
  };

  let passwordChanged: boolean;
  if (DRY) {
    passwordChanged = await seedAll();
  } else {
    passwordChanged = await prisma.$transaction(
      async (tx) => {
        db = tx;
        try {
          return await seedAll();
        } finally {
          db = prisma;
        }
      },
      { maxWait: 15_000, timeout: 180_000 },
    );
  }

  const verb = DRY ? 'por ' : '';
  console.log(`\nResumen: ${counts.crear} ${verb}crear, ${counts.actualizar} ${verb}actualizar, ${counts.borrar} ${verb}borrar${DRY ? ' (dry: nada se escribió)' : ''}.`);
  if (DRY) {
    console.log(`Contraseña: ${passwordChanged ? 'se guardaría la nueva' : 'igual a la guardada'} (no se muestra).`);
    return true;
  }

  const ok = await verify(email, password);
  console.log(ok ? '\nListo: la cuenta entra sin 2FA y ve solo la organización demo.' : '\nAlgo quedó mal: revisa las líneas FALLA.');
  return ok;
}

main()
  .then((ok) => {
    process.exitCode = ok ? 0 : 1;
  })
  .catch((e: unknown) => {
    if (e instanceof Abort) {
      console.error(`\nAbortado (no se escribió nada): ${redact(e.message)}`);
    } else if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`\nError de Prisma ${e.code}: ${redact(JSON.stringify(e.meta ?? {}))}`);
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`\nFalló: ${redact(msg).slice(0, 2000)}`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
