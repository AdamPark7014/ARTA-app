/**
 * Copia, en eventos existentes, los formatos Excel de plantillas activas que traen `excelTemplateUrl`.
 *
 * Uso:
 *   ts-node --transpile-only apps/api/scripts/upgrade-excel-templates.ts [--dry] [--confirm-produccion]
 *
 * Lógica:
 * - Por cada evento activo (o todos), por cada plantilla activa con `excelTemplateUrl`,
 *   si el evento NO tiene ya un EventFile .xlsx con ese nombre/módulo 'checklist',
 *   se copia el libro de la plantilla al evento como archivo editable.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { uploadRoot } from '../src/uploads/upload-storage';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');
const CONFIRM = process.argv.includes('--confirm-produccion');

async function main() {
  const templates = await prisma.checklistTemplate.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  });
  const excelTpls = templates.filter((t) => !!(t as any).excelTemplateUrl);
  if (!excelTpls.length) {
    console.log('Sin plantillas Excel activas — nada que hacer');
    return;
  }
  const events = await prisma.event.findMany({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, entity: true },
  });
  let toCopy = 0;
  for (const ev of events) {
    for (const t of excelTpls) {
      const srcUrl = (t as any).excelTemplateUrl as string;
      const rel = srcUrl.replace(/^\/uploads\//, '');
      const srcPath = join(uploadRoot, rel);
      if (!existsSync(srcPath)) {
        console.warn(`· Falta plantilla en disco: ${srcPath} (skip)`);
        continue;
      }
      const name = `${t.name || 'Formato'}.xlsx`;
      const exists = await prisma.eventFile.findFirst({
        where: { eventId: ev.id, fileName: name, deletedAt: null },
      });
      if (exists) continue;
      toCopy += 1;
      console.log(`${DRY ? '· DRY ' : ''}Evento ${ev.name} ← ${t.name}`);
      if (DRY) continue;
      const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const dest = join(uploadRoot, `${stamp}.xlsx`);
      const buf = readFileSync(srcPath);
      writeFileSync(dest, buf);
      const created = await prisma.eventFile.create({
        data: {
          eventId: ev.id,
          fileName: name,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          url: `/uploads/${stamp}.xlsx`,
          kind: 'excel',
          module: 'checklist',
          createdById: null,
          updatedById: null,
          sha256: createHash('sha256').update(buf).digest('hex'),
        },
      });
      console.log(`  · Copiado como ${created.url}`);
    }
  }
  if (!DRY && !CONFIRM) {
    console.log('AVISO: ejecutaste sin --dry; para producción usa --confirm-produccion luego de validar en staging.');
  }
  console.log(`Hecho. ${toCopy} archivo(s) ${DRY ? 'pendientes (dry-run)' : 'creados'}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

