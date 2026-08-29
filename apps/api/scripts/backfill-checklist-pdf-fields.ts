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
 *
 * **Los formatos ya autorizados quedan fuera por defecto.** Reescribir en bloque
 * un documento firmado no es algo que deba pasar sin que alguien lo pida: las
 * firmas se re-incrustan igual desde la base, pero el archivo cambia. Para
 * incluirlos: `--include-signed`. Para regenerar todo: `--all`.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { ChecklistPdfService } from '../src/checklists/checklist-pdf.service';

const prisma = new PrismaClient();

async function main() {
  const all = process.argv.includes('--all');
  const includeSigned = all || process.argv.includes('--include-signed');

  const where = {
    ...(all ? {} : { pdfFieldsJson: { equals: Prisma.DbNull } }),
    ...(includeSigned ? {} : { authorizedAt: null }),
  };

  // Cuántos formatos firmados se están dejando fuera a propósito.
  const skipped = includeSigned
    ? 0
    : await prisma.checklistInstance.count({
        where: { pdfFieldsJson: { equals: Prisma.DbNull }, NOT: { authorizedAt: null } },
      });

  const pending = await prisma.checklistInstance.findMany({
    where,
    select: { id: true, title: true, eventId: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!pending.length) {
    console.log('Nada que rellenar: todos los checklists ya tienen su mapa de campos.');
    if (skipped) console.log(`(${skipped} autorizados quedaron fuera; usa --include-signed)`);
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
  if (skipped) {
    console.log(
      `${skipped} formato(s) ya autorizados quedaron intactos. Para incluirlos: --include-signed`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
