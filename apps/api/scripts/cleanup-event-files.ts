/**
 * Limpieza de archivos del evento que nunca subió una persona.
 *
 * Uso:
 *   npm run prisma:generate --workspace=apps/api   # si hace falta
 *   ts-node --transpile-only apps/api/scripts/cleanup-event-files.ts --dry
 *   ts-node --transpile-only apps/api/scripts/cleanup-event-files.ts --confirm-produccion
 *
 * Criterios:
 * - EventFile.deletedAt IS NULL
 * - (createdById IS NULL AND kind != 'pdf')  ← placeholders / sistema
 * - OR fileName LIKE '%CAMPAÃ%'              ← mojibake típico de «CAMPAÑA»
 *
 * Borrado = soft-delete: marca deletedAt y conserva el historial.
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const flags = new Set(argv.slice(2));
  return {
    dry: flags.has('--dry') || !flags.has('--confirm-produccion'),
    confirm: flags.has('--confirm-produccion'),
  };
}

async function main() {
  const { dry, confirm } = parseArgs(process.argv);
  const where: Prisma.EventFileWhereInput = {
    deletedAt: null,
    OR: [
      // PDFs base generados al crear el evento desde plantillas de checklist.
      { AND: [{ createdById: null }, { url: { startsWith: '/uploads/checklists/' } }] },
      // Cualquier archivo sin autor que NO sea PDF (basura / placeholders antiguos),
      // EXCLUYENDO Excel generados del sistema que deben quedar visibles en sus módulos.
      {
        AND: [
          { createdById: null },
          { kind: { not: 'pdf' } },
          { module: { notIn: ['campaign', 'finance', 'checklist'] } },
        ],
      },
      // Mojibake notorio de «CAMPAÑA».
      { fileName: { contains: 'CAMPAÃ' } },
    ],
  };

  const candidates = await prisma.eventFile.findMany({
    where,
    select: {
      id: true,
      eventId: true,
      checklistId: true,
      module: true,
      kind: true,
      fileName: true,
      mimeType: true,
      createdAt: true,
      createdById: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (dry) {
    console.log(`--dry: ${candidates.length} archivos candidatos a soft-delete\n`);
    for (const c of candidates.slice(0, 50)) {
      console.log(
        `${c.id}  ${c.kind?.padEnd(6)}  ${String(c.module || '-').padEnd(10)}  ${new Date(c.createdAt).toISOString()}  ${c.fileName}`,
      );
    }
    if (candidates.length > 50) console.log(`… y ${candidates.length - 50} más`);
    console.log('\nEjecute con --confirm-produccion para aplicar.');
    return;
  }

  if (!confirm) {
    console.error('Falta --confirm-produccion. Ejecute primero con --dry para revisar candidatos.');
    process.exit(2);
  }

  let count = 0;
  for (const c of candidates) {
    await prisma.eventFile.update({ where: { id: c.id }, data: { deletedAt: new Date(), deletedById: null } });
    count += 1;
  }
  console.log(`Listo: ${count} archivos marcados como borrados (soft-delete).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

