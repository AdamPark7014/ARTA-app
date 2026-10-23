/**
 * Recalcula `progressPct` de los formatos que ya existen con la regla vigente
 * (`formatProgress` en `src/common/checklist-progress.ts`).
 *
 * 23-10-2026 · Junta de Adam con el cliente: «no todos los eventos tienen los
 * mismos caracteres de los checklist; en cuanto se termine y se mande se tome
 * como 100 por ciento aunque no se haya palomeado todo». Desde entonces un
 * formato con firma de entrega o de autorización, o mandado a revisión,
 * aprobado o sellado, guarda 100 %. Los que se mandaron antes del cambio
 * conservan el porcentaje viejo hasta correr esto.
 *
 * (Antes, 2026-09: el cálculo contaba la sección `firmas` que el seed añade a
 * todas las plantillas y salía inflado; esto mismo lo corrigió.)
 *
 * Simulacro primero, siempre (no escribe nada):
 *
 *   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only \
 *     scripts/backfill-checklist-progress.ts --dry
 *
 * Aplicar en producción (fuera de una base local lo exige):
 *
 *   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only \
 *     scripts/backfill-checklist-progress.ts --confirm-produccion
 *
 * Opciones: `--event <id>` (solo los formatos de ese evento) ·
 * `--solo-mandados` (solo sube a 100 % los mandados; no corrige el avance de
 * los demás aunque esté desfasado de lo capturado).
 *
 * Idempotente: solo escribe las filas cuyo porcentaje cambia y no toca datos,
 * estados, firmas, revisiones ni PDFs (el porcentaje no se imprime en el PDF).
 * Deja una entrada de auditoría por corrida con lo que cambió.
 *
 * ⚠️ Los formatos mandados SUBEN a 100 %: el avance medio del evento, la
 * analítica («Formatos al día», riesgo) y los digests van a mejorar de golpe.
 * Es la regla nueva, no un error; conviene avisar al equipo el mismo día.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { calcProgress, formatProgress, isFormatSent } from '../src/common/checklist-progress';

const isLocalDb = (url = process.env.DATABASE_URL || '') =>
  /@(localhost|127\.0\.0\.1|db)(:\d+)?\//.test(url);

const has = (flag: string) => process.argv.includes(flag);

function arg(name: string): string | null {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = process.argv.indexOf(`--${name}`);
  const next = idx >= 0 ? process.argv[idx + 1] : undefined;
  return next && !next.startsWith('--') ? next : null;
}

async function main() {
  const dry = has('--dry');
  const onlyEvent = arg('event');
  const onlySent = has('--solo-mandados');
  if (!dry && !isLocalDb() && !has('--confirm-produccion')) {
    throw new Error('Base no local: corre primero con --dry y aplica con --confirm-produccion');
  }

  const prisma = new PrismaClient();
  const tag = dry ? '[dry] ' : '';
  try {
    const rows = await prisma.checklistInstance.findMany({
      where: onlyEvent ? { eventId: onlyEvent } : {},
      select: {
        id: true,
        title: true,
        progressPct: true,
        dataJson: true,
        status: true,
        deliveredAt: true,
        authorizedAt: true,
        deliveredSignature: true,
        authorizedSignature: true,
        event: { select: { id: true, name: true, organizationId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(
      `${tag}Revisando ${rows.length} formato(s)${onlyEvent ? ` del evento ${onlyEvent}` : ''}` +
        `${onlySent ? ' · solo los mandados' : ''}…`,
    );

    const changes: Array<{ id: string; event: string; title: string; before: number; after: number; sent: boolean }> = [];
    for (const row of rows) {
      if (onlySent && !isFormatSent(row)) continue;
      const next = formatProgress(row.dataJson, row);
      if (next === row.progressPct) continue;
      changes.push({
        id: row.id,
        event: row.event.name,
        title: row.title,
        before: row.progressPct,
        after: next,
        sent: isFormatSent(row),
      });
    }

    const up = changes.filter((c) => c.after > c.before);
    const down = changes.filter((c) => c.after < c.before);
    console.log(`\n${changes.length} de ${rows.length} cambian · ${up.length} suben · ${down.length} bajan.`);
    for (const c of changes) {
      const why = c.sent ? 'mandado → 100 %' : `capturado ${calcProgress(rows.find((r) => r.id === c.id)!.dataJson)} %`;
      console.log(`  ${tag}${String(c.before).padStart(3)}% → ${String(c.after).padStart(3)}%  ${c.event} — ${c.title} (${why})`);
    }

    if (dry) {
      console.log('\nSimulacro: no se guardó nada. Aplica con --confirm-produccion (o sin flags en una base local).');
      return;
    }

    for (const c of changes) {
      await prisma.checklistInstance.update({ where: { id: c.id }, data: { progressPct: c.after } });
    }

    if (changes.length) {
      // Una entrada por organización: quién lo corrió no es una persona, es el script.
      const byOrg = new Map<string | null, typeof changes>();
      for (const c of changes) {
        const org = rows.find((r) => r.id === c.id)!.event.organizationId ?? null;
        byOrg.set(org, [...(byOrg.get(org) ?? []), c]);
      }
      for (const [organizationId, list] of byOrg) {
        await prisma.auditLog.create({
          data: {
            organizationId,
            action: 'checklist.progress.recalc',
            resource: 'ChecklistInstance',
            metaJson: {
              via: 'scripts/backfill-checklist-progress.ts',
              rule: 'formato mandado = 100 %',
              changes: list.map((c) => ({ id: c.id, before: c.before, after: c.after })),
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
    console.log(`\nListo: ${changes.length} formato(s) actualizados.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
