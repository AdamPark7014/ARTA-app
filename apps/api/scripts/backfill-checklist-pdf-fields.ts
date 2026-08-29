/**
 * Rellena el mapa de campos del PDF de los checklists que ya existían.
 *
 * `pdfFieldsJson` se escribe cuando el PDF se genera, así que los formatos
 * creados antes de esa función lo tienen en NULL y el panel cae a la vista de
 * formulario. Este script los regenera una vez, con el mismo servicio que usa
 * la aplicación, para que se pueda escribir sobre la hoja desde el primer día.
 *
 *   docker exec arta-api npx ts-node --transpile-only \
 *     scripts/backfill-checklist-pdf-fields.ts
 *
 * Es idempotente y seguro de repetir: regenerar un PDF no cambia los datos del
 * checklist ni sus firmas, solo vuelve a imprimir el archivo.
 */
import { PrismaClient } from '@prisma/client';
import { ChecklistPdfService } from '../src/checklists/checklist-pdf.service';

const prisma = new PrismaClient();

async function main() {
  const onlyMissing = process.argv.includes('--all') ? {} : { pdfFieldsJson: { equals: null } };

  const pending = await prisma.checklistInstance.findMany({
    where: onlyMissing,
    select: { id: true, title: true, eventId: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!pending.length) {
    console.log('Nada que rellenar: todos los checklists ya tienen su mapa de campos.');
    return;
  }

  console.log(`Regenerando ${pending.length} checklist(s)…`);
  const svc = new ChecklistPdfService(prisma as never);

  let ok = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      await svc.regenerateInstance(row.id);
      ok += 1;
      if (ok % 10 === 0) console.log(`  · ${ok}/${pending.length}`);
    } catch (e) {
      failed += 1;
      console.error(`  ✗ ${row.title} (${row.id}): ${String(e)}`);
    }
  }

  console.log(`\nListo: ${ok} regenerados${failed ? `, ${failed} con error` : ''}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
