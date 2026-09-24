/**
 * Backfill: crea slots por evento para documentos estándar y marca reemplazados cuando haya archivo externo cargado.
 * Uso:
 *   ts-node --transpile-only apps/api/scripts/backfill-document-slots.ts [--apply] [--include-seed]
 */
import { PrismaClient } from '@prisma/client';

function has(name: string) {
  return process.argv.includes(`--${name}`);
}

const prisma = new PrismaClient();

async function run() {
  const APPLY = has('apply');
  const INCLUDE_SEED = has('include-seed');
  const events = await prisma.event.findMany({ select: { id: true, name: true, notes: true } });
  let created = 0;
  for (const ev of events) {
    // Saltar eventos demo a menos que se pida explícitamente
    const seedTagged =
      (ev.name && /\[SEED_DEMO\]/i.test(ev.name)) || (ev.notes && /\[SEED_DEMO\]/i.test(ev.notes || ''));
    if (seedTagged && !INCLUDE_SEED) continue;
    // Standard checklist templates active
    const templates = await prisma.checklistTemplate.findMany({ where: { active: true }, select: { id: true, key: true } });
    for (const t of templates) {
      const exists = await prisma.eventDocumentSlot.findFirst({
        where: { eventId: ev.id, kind: 'CHECKLIST', checklistTemplateId: t.id },
      });
      if (!exists) {
        console.log(`${APPLY ? '' : '· DRY '}Crear slot CHECKLIST ${t.key} en ${ev.id}`);
        if (APPLY) {
          await prisma.eventDocumentSlot.create({ data: { eventId: ev.id, kind: 'CHECKLIST', checklistTemplateId: t.id, status: 'INTERNAL' as any } });
          created += 1;
        }
      }
    }
    // Campaign / Corrida slots
    for (const kind of ['CAMPAIGN', 'CORRIDA', 'PENDONES', 'BOLETERA'] as const) {
      const exists = await prisma.eventDocumentSlot.findFirst({ where: { eventId: ev.id, kind } });
      if (!exists) {
        console.log(`${APPLY ? '' : '· DRY '}Crear slot ${kind} en ${ev.id}`);
        if (APPLY) {
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

