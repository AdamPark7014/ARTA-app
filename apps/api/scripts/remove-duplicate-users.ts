/**
 * 16-09-2026 · Adam: «quita a Melissa y elimina usuarios duplicados».
 *
 * Un seed viejo dio de alta al equipo con `@arta.mx`; el oficial es
 * `@artaproducciones.com` (Rodrigo, `@arema.mx`). Una cuenta `@arta.mx` es
 * duplicada si existe otra oficial con el mismo nombre: lo que tenga colgado
 * (eventos, OC, tareas, formatos, bitácora…) pasa a la oficial y la vieja se
 * borra. Sesiones, membresías y notificaciones de la vieja se van con ella.
 *
 * Melissa ya no está en el equipo: se borra sin cuenta a la que heredar.
 * Una `@arta.mx` sin gemela oficial no se toca; solo se reporta.
 *
 *   npx ts-node --transpile-only scripts/remove-duplicate-users.ts --dry
 *   npx ts-node --transpile-only scripts/remove-duplicate-users.ts
 *
 * Fuera de una base local exige además `--confirm-produccion`.
 */
import { PrismaClient, type Prisma } from '@prisma/client';

const LEGACY_DOMAIN = '@arta.mx';
const REMOVE_OUTRIGHT = ['melissa@arta.mx', 'melissa@artaproducciones.com'];

type UserRow = { id: string; email: string; fullName: string; roleKey: string };
type FkColumn = { table: string; column: string; cascade: boolean };
type Plan = { user: UserRow; keeper: UserRow | null };

const normalizeName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

const isLocalDb = (url = process.env.DATABASE_URL || '') =>
  /@(localhost|127\.0\.0\.1|db)(:\d+)?\//.test(url);

const quoted = (id: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(id)) throw new Error(`Identificador inesperado: ${id}`);
  return `"${id}"`;
};

async function userFkColumns(prisma: PrismaClient): Promise<FkColumn[]> {
  const rows = await prisma.$queryRaw<{ table: string; column: string; rule: string }[]>`
    SELECT tc.table_name AS "table", kcu.column_name AS "column", rc.delete_rule AS "rule"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'User'
    ORDER BY 1, 2`;
  return rows.map((r) => ({ table: r.table, column: r.column, cascade: r.rule === 'CASCADE' }));
}

/** Columnas cuyo contenido se hereda: todo lo que no se borra en cascada, más el chat. */
const inherits = (fk: FkColumn) => !fk.cascade || fk.table === 'ChatMessage';

async function countRefs(db: PrismaClient | Prisma.TransactionClient, fks: FkColumn[], userId: string) {
  const out: Record<string, number> = {};
  for (const fk of fks) {
    const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM ${quoted(fk.table)} WHERE ${quoted(fk.column)} = $1`,
      userId,
    );
    if (n) out[`${fk.table}.${fk.column}`] = n;
  }
  return out;
}

async function main() {
  const dry = process.argv.includes('--dry');
  if (!dry && !isLocalDb() && !process.argv.includes('--confirm-produccion')) {
    throw new Error('Base no local: corre primero con --dry y aplica con --confirm-produccion');
  }

  const prisma = new PrismaClient();
  try {
    const users: UserRow[] = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true, roleKey: true },
      orderBy: { email: 'asc' },
    });
    const fks = await userFkColumns(prisma);

    const plans: Plan[] = [];
    for (const u of users) {
      const email = u.email.toLowerCase();
      if (REMOVE_OUTRIGHT.includes(email)) {
        plans.push({ user: u, keeper: null });
        continue;
      }
      if (!email.endsWith(LEGACY_DOMAIN)) continue;
      const keeper = users.find(
        (o) =>
          o.id !== u.id &&
          !o.email.toLowerCase().endsWith(LEGACY_DOMAIN) &&
          normalizeName(o.fullName) === normalizeName(u.fullName),
      );
      if (keeper) plans.push({ user: u, keeper });
      else console.log(`  ! ${u.email} (${u.fullName}): sin cuenta oficial gemela, no se toca`);
    }

    // Nombres repetidos entre cuentas oficiales: se avisan, no se deciden aquí.
    const byName = new Map<string, UserRow[]>();
    for (const u of users.filter((x) => !plans.some((p) => p.user.id === x.id))) {
      const k = normalizeName(u.fullName);
      byName.set(k, [...(byName.get(k) || []), u]);
    }
    for (const group of byName.values()) {
      if (group.length > 1) console.log(`  ! Nombre repetido, revisar a mano: ${group.map((g) => g.email).join(', ')}`);
    }

    if (!plans.length) {
      console.log(`Sin duplicados ni cuentas a quitar (${users.length} usuarios).`);
      return;
    }

    for (const { user, keeper } of plans) {
      const refs = await countRefs(prisma, fks, user.id);
      const detail = Object.entries(refs).map(([k, n]) => `${k}:${n}`).join(' ') || 'nada colgado';
      console.log(
        `  → borrar ${user.email} (${user.fullName}, ${user.roleKey})` +
          (keeper ? ` · hereda ${keeper.email}` : ' · sin heredero') +
          ` · ${detail}`,
      );
      if (dry) continue;

      await prisma.$transaction(async (tx) => {
        const moved: Record<string, number> = {};
        if (keeper) {
          for (const fk of fks.filter(inherits)) {
            const n = await tx.$executeRawUnsafe(
              `UPDATE ${quoted(fk.table)} SET ${quoted(fk.column)} = $1 WHERE ${quoted(fk.column)} = $2`,
              keeper.id,
              user.id,
            );
            if (n) moved[`${fk.table}.${fk.column}`] = n;
          }
        }
        await tx.auditLog.create({
          data: {
            userId: keeper?.id ?? null,
            action: keeper ? 'user.duplicate.merged' : 'user.removed',
            resource: 'User',
            resourceId: user.id,
            metaJson: {
              email: user.email,
              fullName: user.fullName,
              roleKey: user.roleKey,
              mergedInto: keeper?.email ?? null,
              moved,
            },
          },
        });
        await tx.user.delete({ where: { id: user.id } });
      });
    }
    console.log(dry ? 'Simulación: no se escribió nada.' : `Listo: ${plans.length} cuenta(s) quitadas.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
