/**
 * Recalcula `progressPct` de los checklists que ya existen.
 *
 * El cálculo del servidor contaba la sección `firmas` que el seed añade a TODAS
 * las plantillas con dos ítems de texto ya rellenados («Usar botón Firmar
 * entregado»). Esos dos ítems puntuaban siempre, así que el avance salía
 * inflado — y no coincidía con el que muestra el panel, que sí filtra esa
 * sección. Ahora la fórmula vive en un solo sitio
 * (`src/common/checklist-progress.ts`) y excluye firmas.
 *
 *   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only \
 *     scripts/backfill-checklist-progress.ts
 *
 * Idempotente: solo escribe las filas cuyo porcentaje cambia, y no toca datos,
 * firmas ni PDFs. Con `--dry` enseña el impacto sin guardar nada.
 *
 * ⚠️ Los porcentajes BAJAN. Los umbrales de riesgo de `/analytics/ops` y los
 * digests van a reclasificar formatos de golpe: es corregir una cifra que
 * mentía, pero conviene avisar al equipo el mismo día y, si los digests están
 * activos, dejarlos en silencio 24 h.
 */
import { PrismaClient } from '@prisma/client';
import { calcProgress } from '../src/common/checklist-progress';

const prisma = new PrismaClient();

async function main() {
  const dry = process.argv.includes('--dry');

  const rows = await prisma.checklistInstance.findMany({
    select: { id: true, title: true, progressPct: true, dataJson: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Revisando ${rows.length} checklist(s)…${dry ? ' (simulacro)' : ''}`);

  let changed = 0;
  let totalDrop = 0;
  const worst: Array<{ title: string; before: number; after: number }> = [];

  for (const row of rows) {
    const next = calcProgress(row.dataJson);
    if (next === row.progressPct) continue;

    changed += 1;
    totalDrop += row.progressPct - next;
    worst.push({ title: row.title, before: row.progressPct, after: next });

    if (!dry) {
      await prisma.checklistInstance.update({
        where: { id: row.id },
        data: { progressPct: next },
      });
    }
  }

  worst.sort((a, b) => b.before - b.after - (a.before - a.after));

  console.log(`\n${changed} de ${rows.length} cambian de porcentaje.`);
  if (changed) {
    console.log(`Caída media: ${(totalDrop / changed).toFixed(1)} puntos.`);
    console.log('\nLos diez mayores ajustes:');
    for (const w of worst.slice(0, 10)) {
      console.log(`  ${w.before}% → ${w.after}%   ${w.title}`);
    }
  }
  console.log(dry ? '\nSimulacro: no se guardó nada.' : '\nListo.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
