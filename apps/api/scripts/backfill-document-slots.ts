/**
 * Backfill: crea slots por evento para documentos estándar y marca reemplazados cuando haya archivo externo cargado.
 * Uso:
 *   ts-node --transpile-only apps/api/scripts/backfill-document-slots.ts --dry | --confirm-produccion
 */
import { PrismaClient } from '@prisma/client';

function has(name: string) {
  return process.argv.includes(`--${name}`);
}

const prisma = new PrismaClient();

async function run() {
  const DRY = has('dry');
  const CONFIRM = has('confirm-produccion');
  if (!DRY && !CONFIRM) {
    console.log('Modo seguro: pase --dry o --confirm-produccion');
    process.exit(2);
  }
  const events = await prisma.event.findMany({ select: { id: true } });
  let created = 0;
  for (const ev of events) {
    // Standard checklist templates active
    const templates = await prisma.checklistTemplate.findMany({ where: { active: true }, select: { id: true, key: true } });
    for (const t of templates) {
      const exists = await prisma.eventDocumentSlot.findFirst({
        where: { eventId: ev.id, kind: 'CHECKLIST', checklistTemplateId: t.id },
      });
      if (!exists) {
        console.log(`${DRY ? '· DRY ' : ''}Crear slot CHECKLIST ${t.key} en ${ev.id}`);
        if (!DRY) {
          await prisma.eventDocumentSlot.create({ data: { eventId: ev.id, kind: 'CHECKLIST', checklistTemplateId: t.id, status: 'INTERNAL' as any } });
          created += 1;
        }
      }
    }
    // Campaign / Corrida slots
    for (const kind of ['CAMPAIGN', 'CORRIDA', 'PENDONES', 'BOLETERA'] as const) {
      const exists = await prisma.eventDocumentSlot.findFirst({ where: { eventId: ev.id, kind } });
      if (!exists) {
        console.log(`${DRY ? '· DRY ' : ''}Crear slot ${kind} en ${ev.id}`);
        if (!DRY) {
          await prisma.eventDocumentSlot.create({ data: { eventId: ev.id, kind, status: 'INTERNAL' as any } });
          created += 1;
        }
      }
    }
  }
  console.log(`Listo. Slots creados: ${created}`);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

