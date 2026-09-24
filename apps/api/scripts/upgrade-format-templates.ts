/**
 * 23-09-2026 · Los formatos de la carpeta «FORMATOS ARTA» (Drive) pasan a ser
 * los formatos estándar del sistema (`src/checklists/format-catalog.ts`).
 *
 * Qué hace, en este orden:
 *  1. Sube cada plantilla estándar a la versión del catálogo: guarda un
 *     snapshot en `ChecklistTemplateVersion` (se puede restaurar desde
 *     Plantillas) y deja auditoría.
 *  2. Migra los formatos ya creados que sigan en borrador o en revisión y sin
 *     firma de autorización: conserva lo capturado (por id de ítem), rellena
 *     el encabezado desde el evento, guarda la versión anterior en
 *     `ChecklistVersion` y regenera el PDF. Los aprobados, sellados o
 *     autorizados no se tocan.
 *  3. Retira (deja inactivas) las plantillas que duplican un módulo: Orden de
 *     compra, Boletera, Corrida, Campaña, Anticipos. Sus formatos existentes
 *     siguen abriendo; los eventos nuevos ya no las reciben.
 *
 *   npx ts-node --transpile-only scripts/upgrade-format-templates.ts --dry
 *   npx ts-node --transpile-only scripts/upgrade-format-templates.ts
 *
 * Opciones: `--skip-instances` (solo plantillas) · `--keep-duplicates` (no
 * retira) · `--force` (reescribe aunque la plantilla ya esté en la versión).
 * Fuera de una base local exige además `--confirm-produccion`.
 *
 * En Docker: `docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/upgrade-format-templates.ts --dry`
 */
import { DocStatus, Prisma, PrismaClient } from '@prisma/client';
import { calcProgress } from '../src/common/checklist-progress';
import { bindFormatToEvent, carryFormatValues, normalizeFormatData } from '../src/common/format-schema';
import {
  RETIRED_TEMPLATES,
  STANDARD_FORMATS,
  STANDARD_FORMAT_VERSION,
  storedFormatVersion,
} from '../src/checklists/format-catalog';
import { ChecklistPdfService } from '../src/checklists/checklist-pdf.service';

const isLocalDb = (url = process.env.DATABASE_URL || '') =>
  /@(localhost|127\.0\.0\.1|db)(:\d+)?\//.test(url);

const has = (flag: string) => process.argv.includes(flag);

async function main() {
  const dry = has('--dry');
  const force = has('--force');
  const skipInstances = has('--skip-instances');
  const keepDuplicates = has('--keep-duplicates');
  if (!dry && !isLocalDb() && !has('--confirm-produccion')) {
    throw new Error('Base no local: corre primero con --dry y aplica con --confirm-produccion');
  }

  const prisma = new PrismaClient();
  const pdfs = new ChecklistPdfService(prisma as never);
  const tag = dry ? '[dry]' : '';
  const summary = { created: 0, upgraded: 0, kept: 0, migrated: 0, skipped: 0, retired: 0, pdfErrors: 0 };

  try {
    for (const format of STANDARD_FORMATS) {
      const schemaJson = format.schema as unknown as Prisma.InputJsonValue;
      const existing = await prisma.checklistTemplate.findFirst({ where: { key: format.key } });

      if (!existing) {
        console.log(`${tag} + ${format.name}: no existía, se crea`);
        if (!dry) {
          await prisma.checklistTemplate.create({
            data: {
              key: format.key,
              name: format.name,
              description: format.description,
              entities: format.entities,
              schemaJson,
              active: true,
            },
          });
        }
        summary.created += 1;
        continue;
      }

      const stored = storedFormatVersion(existing.schemaJson);
      if (stored >= STANDARD_FORMAT_VERSION && !force) {
        console.log(`${tag} = ${format.name}: ya en v${stored}`);
        summary.kept += 1;
      } else {
        console.log(`${tag} ↑ ${format.name}: v${stored || 'legada'} → v${STANDARD_FORMAT_VERSION} (plantilla v${existing.version} → v${existing.version + 1})`);
        if (!dry) {
          await prisma.checklistTemplateVersion.create({
            data: {
              templateId: existing.id,
              schemaJson: existing.schemaJson as Prisma.InputJsonValue,
              version: existing.version,
              note: `Snapshot v${existing.version} antes de estandarizar (catálogo v${STANDARD_FORMAT_VERSION})`,
            },
          });
          await prisma.checklistTemplate.update({
            where: { id: existing.id },
            data: {
              name: format.name,
              description: format.description,
              entities: format.entities,
              schemaJson,
              version: existing.version + 1,
              active: true,
            },
          });
          await prisma.auditLog.create({
            data: {
              action: 'template.schema.upgrade',
              resource: 'ChecklistTemplate',
              resourceId: existing.id,
              metaJson: { fromVersion: existing.version, toVersion: existing.version + 1, catalog: STANDARD_FORMAT_VERSION },
            },
          });
        }
        summary.upgraded += 1;
      }

      if (skipInstances) continue;

      // Formatos vivos de esta plantilla: solo los que nadie autorizó todavía.
      const instances = await prisma.checklistInstance.findMany({
        where: {
          templateId: existing.id,
          status: { in: [DocStatus.DRAFT, DocStatus.REVIEW] },
          authorizedAt: null,
          authorizedSignature: { equals: Prisma.DbNull },
        },
        include: { event: true },
        orderBy: { createdAt: 'asc' },
      });
      const locked = await prisma.checklistInstance.count({
        where: {
          templateId: existing.id,
          NOT: { status: { in: [DocStatus.DRAFT, DocStatus.REVIEW] }, authorizedAt: null },
        },
      });
      if (locked) summary.skipped += locked;

      for (const inst of instances) {
        if (storedFormatVersion(inst.dataJson) >= STANDARD_FORMAT_VERSION && !force) continue;
        const next = bindFormatToEvent(carryFormatValues(normalizeFormatData(format.schema), inst.dataJson), inst.event);
        const progressPct = calcProgress(next);
        console.log(`${tag}   · ${inst.event.name} — ${inst.title}: migrado (avance ${inst.progressPct}% → ${progressPct}%)`);
        if (!dry) {
          await prisma.checklistVersion.create({
            data: {
              instanceId: inst.id,
              dataJson: inst.dataJson as Prisma.InputJsonValue,
              note: `Antes de estandarizar el formato (catálogo v${STANDARD_FORMAT_VERSION})`,
            },
          });
          await prisma.checklistInstance.update({
            where: { id: inst.id },
            data: {
              dataJson: next as unknown as Prisma.InputJsonValue,
              progressPct,
              title: format.name,
              revision: { increment: 1 },
            },
          });
          try {
            await pdfs.regenerateInstance(inst.id);
          } catch (e) {
            summary.pdfErrors += 1;
            console.error(`     ✗ PDF de ${inst.title} (${inst.id}): ${String(e)}`);
          }
        }
        summary.migrated += 1;
      }
    }

    if (!keepDuplicates) {
      for (const r of RETIRED_TEMPLATES) {
        const t = await prisma.checklistTemplate.findFirst({ where: { key: r.key } });
        if (!t || !t.active) continue;
        console.log(`${tag} − ${t.name}: se retira (${r.reason})`);
        if (!dry) {
          await prisma.checklistTemplate.update({ where: { id: t.id }, data: { active: false } });
          await prisma.auditLog.create({
            data: {
              action: 'template.retire',
              resource: 'ChecklistTemplate',
              resourceId: t.id,
              metaJson: { reason: r.reason },
            },
          });
        }
        summary.retired += 1;
      }
    }

    console.log(
      `\n${dry ? 'Simulación' : 'Listo'}: ${summary.created} creadas · ${summary.upgraded} actualizadas · ${summary.kept} ya al día · ` +
        `${summary.migrated} formatos migrados · ${summary.skipped} intactos por estar aprobados/sellados/autorizados · ` +
        `${summary.retired} plantillas retiradas${summary.pdfErrors ? ` · ${summary.pdfErrors} PDFs con error` : ''}.`,
    );
    if (dry) console.log('Nada se escribió. Quita --dry para aplicar.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
