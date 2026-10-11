/**
 * 23-09-2026 · Los formatos de la carpeta «FORMATOS ARTA» (Drive) pasan a ser
 * los formatos estándar del sistema (`src/checklists/format-catalog.ts`).
 * 11-10-2026 · ARTA y Auditorio separados: los de Arta solo para eventos de
 * Arta y el Auditorio con los suyos (Checklist Auditorio, Limpieza,
 * Mantenimiento y Compromiso de horarios).
 *
 * Qué hace, en este orden (todo idempotente: correrlo dos veces no cambia nada
 * la segunda):
 *  1. Crea las plantillas estándar que falten.
 *  2. Pone a cada plantilla estándar las entidades del catálogo (Arta solo
 *     ARTA, Auditorio solo EXPLANADA), con auditoría.
 *  3. Sube cada plantilla a la versión de SU formato en el catálogo
 *     (`formatVersion`): guarda un snapshot en `ChecklistTemplateVersion` (se
 *     puede restaurar desde Plantillas) y deja auditoría.
 *  4. Migra los formatos ya creados que sigan en borrador o en revisión y sin
 *     firma de autorización: conserva lo capturado (por id de ítem), rellena
 *     el encabezado desde el evento, guarda la versión anterior en
 *     `ChecklistVersion` y regenera el PDF. Los aprobados, sellados o
 *     autorizados no se tocan, ni los de eventos cerrados o cancelados. Si la
 *     forma nueva dejaría fuera algo capturado
 *     (una tabla que ya no existe, «Campos adicionales»…) ese formato NO se
 *     migra y se reporta; `--allow-data-loss` lo migra igual (lo anterior
 *     queda en «Versiones»).
 *  5. Entidades de plantillas activas fuera del catálogo
 *     (`EXTRA_TEMPLATE_ENTITIES`: «Distribución de Pendones (Excel)» → ARTA).
 *  6. Retira (deja inactivas) las plantillas que duplican un módulo: Orden de
 *     compra, Boletera, Corrida, Campaña, Anticipos. Sus formatos existentes
 *     siguen abriendo; los eventos nuevos ya no las reciben.
 *  7. Solo con `--add-auditorio-formats`: a cada evento ABIERTO del Auditorio
 *     (no cerrado ni cancelado) le agrega los formatos del Auditorio que le
 *     falten, como «Agregar formato». Nunca borra ni modifica los formatos que
 *     el evento ya tiene: si ya existe uno de esa plantilla, no se crea otro.
 *
 *   npx ts-node --transpile-only scripts/upgrade-format-templates.ts --dry
 *   npx ts-node --transpile-only scripts/upgrade-format-templates.ts
 *
 * Opciones: `--skip-instances` (no migra formatos ya creados) ·
 * `--keep-duplicates` (no retira) · `--force` (reescribe aunque la plantilla ya
 * esté en la versión) · `--allow-data-loss` (migra aunque se pierda algo
 * capturado) · `--add-auditorio-formats` (paso 7) · `--event <id>` (paso 7
 * solo para ese evento) · `--include-seed` (paso 7 también en eventos
 * [SEED_DEMO]). Fuera de una base local exige además `--confirm-produccion`.
 *
 * En Docker: `docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/upgrade-format-templates.ts --dry`
 */
import { DocStatus, EntityKey, EventStatus, Prisma, PrismaClient } from '@prisma/client';
import { calcProgress } from '../src/common/checklist-progress';
import {
  bindFormatToEvent,
  carryFormatValues,
  droppedFormatValues,
  normalizeFormatData,
} from '../src/common/format-schema';
import {
  EXTRA_TEMPLATE_ENTITIES,
  RETIRED_TEMPLATES,
  STANDARD_FORMATS,
  storedFormatVersion,
} from '../src/checklists/format-catalog';
import { ChecklistPdfService } from '../src/checklists/checklist-pdf.service';

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

const sameEntities = (a: EntityKey[], b: EntityKey[]) =>
  [...a].sort().join(',') === [...b].sort().join(',');

const entitiesLabel = (list: EntityKey[]) => (list.length ? list.join('+') : 'las dos');

const SEED_TAG = /\[SEED_DEMO\]/i;

async function main() {
  const dry = has('--dry');
  const force = has('--force');
  const skipInstances = has('--skip-instances');
  const keepDuplicates = has('--keep-duplicates');
  const allowDataLoss = has('--allow-data-loss');
  const addAuditorio = has('--add-auditorio-formats');
  const onlyEvent = arg('event');
  const includeSeed = has('--include-seed');
  if (!dry && !isLocalDb() && !has('--confirm-produccion')) {
    throw new Error('Base no local: corre primero con --dry y aplica con --confirm-produccion');
  }
  if (onlyEvent && !addAuditorio) {
    throw new Error('--event solo aplica con --add-auditorio-formats');
  }

  const prisma = new PrismaClient();
  const pdfs = new ChecklistPdfService(prisma as never);
  const tag = dry ? '[dry]' : '';
  const summary = {
    created: 0,
    upgraded: 0,
    kept: 0,
    entities: 0,
    migrated: 0,
    skipped: 0,
    blocked: 0,
    retired: 0,
    added: 0,
    pdfErrors: 0,
  };

  try {
    for (const format of STANDARD_FORMATS) {
      const schemaJson = format.schema as unknown as Prisma.InputJsonValue;
      const target = storedFormatVersion(format.schema);
      const existing = await prisma.checklistTemplate.findFirst({ where: { key: format.key } });

      if (!existing) {
        console.log(`${tag} + ${format.name}: no existía, se crea (v${target}, ${entitiesLabel(format.entities)})`);
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

      // Entidades: Arta solo ARTA, Auditorio solo EXPLANADA (separación 11-10-2026).
      if (!sameEntities(existing.entities, format.entities)) {
        console.log(
          `${tag} ⇄ ${format.name}: entidades ${entitiesLabel(existing.entities)} → ${entitiesLabel(format.entities)}`,
        );
        if (!dry) {
          await prisma.checklistTemplate.update({ where: { id: existing.id }, data: { entities: format.entities } });
          await prisma.auditLog.create({
            data: {
              action: 'template.entities.update',
              resource: 'ChecklistTemplate',
              resourceId: existing.id,
              metaJson: { from: existing.entities, to: format.entities },
            },
          });
        }
        summary.entities += 1;
      }

      const stored = storedFormatVersion(existing.schemaJson);
      if (stored >= target && !force) {
        console.log(`${tag} = ${format.name}: ya en v${stored}`);
        summary.kept += 1;
      } else {
        console.log(`${tag} ↑ ${format.name}: v${stored || 'legada'} → v${target} (plantilla v${existing.version} → v${existing.version + 1})`);
        if (!dry) {
          await prisma.checklistTemplateVersion.create({
            data: {
              templateId: existing.id,
              schemaJson: existing.schemaJson as Prisma.InputJsonValue,
              version: existing.version,
              note: `Snapshot v${existing.version} antes de estandarizar (catálogo v${target})`,
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
              metaJson: { fromVersion: existing.version, toVersion: existing.version + 1, catalog: target },
            },
          });
        }
        summary.upgraded += 1;
      }

      if (skipInstances) continue;

      // Formatos vivos de esta plantilla: solo los que nadie autorizó todavía,
      // de eventos abiertos (lo de un evento cerrado o cancelado es historia).
      const closedEvent = { status: { in: [EventStatus.CLOSED, EventStatus.CANCELLED] } };
      const instances = await prisma.checklistInstance.findMany({
        where: {
          templateId: existing.id,
          status: { in: [DocStatus.DRAFT, DocStatus.REVIEW] },
          authorizedAt: null,
          authorizedSignature: { equals: Prisma.DbNull },
          NOT: { event: closedEvent },
        },
        include: { event: true },
        orderBy: { createdAt: 'asc' },
      });
      const locked = await prisma.checklistInstance.count({
        where: {
          templateId: existing.id,
          OR: [
            { NOT: { status: { in: [DocStatus.DRAFT, DocStatus.REVIEW] }, authorizedAt: null } },
            { event: closedEvent },
          ],
        },
      });
      if (locked) summary.skipped += locked;

      for (const inst of instances) {
        if (storedFormatVersion(inst.dataJson) >= target && !force) continue;
        const lost = droppedFormatValues(format.schema, inst.dataJson);
        if (lost.length && !allowDataLoss) {
          console.log(
            `${tag}   ! ${inst.event.name} — ${inst.title}: NO se migra, perdería lo capturado en ${lost.join(' · ')} ` +
              '(se queda como está; --allow-data-loss lo migra y guarda lo anterior en Versiones)',
          );
          summary.blocked += 1;
          continue;
        }
        const next = bindFormatToEvent(carryFormatValues(normalizeFormatData(format.schema), inst.dataJson), inst.event);
        const progressPct = calcProgress(next);
        console.log(
          `${tag}   · ${inst.event.name} — ${inst.title}: migrado (avance ${inst.progressPct}% → ${progressPct}%)` +
            (lost.length ? ` · se queda en Versiones: ${lost.join(' · ')}` : ''),
        );
        if (!dry) {
          await prisma.checklistVersion.create({
            data: {
              instanceId: inst.id,
              dataJson: inst.dataJson as Prisma.InputJsonValue,
              note: `Antes de estandarizar el formato (catálogo v${target})`,
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

    for (const extra of EXTRA_TEMPLATE_ENTITIES) {
      const rows = await prisma.checklistTemplate.findMany({ where: { key: extra.key, name: extra.name } });
      for (const t of rows) {
        if (sameEntities(t.entities, extra.entities)) continue;
        console.log(`${tag} ⇄ ${t.name}: entidades ${entitiesLabel(t.entities)} → ${entitiesLabel(extra.entities)}`);
        if (!dry) {
          await prisma.checklistTemplate.update({ where: { id: t.id }, data: { entities: extra.entities } });
          await prisma.auditLog.create({
            data: {
              action: 'template.entities.update',
              resource: 'ChecklistTemplate',
              resourceId: t.id,
              metaJson: { from: t.entities, to: extra.entities },
            },
          });
        }
        summary.entities += 1;
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

    if (addAuditorio) {
      await addAuditorioFormats(prisma, pdfs, { dry, tag, onlyEvent, includeSeed, summary });
    }

    console.log(
      `\n${dry ? 'Simulación' : 'Listo'}: ${summary.created} creadas · ${summary.upgraded} actualizadas · ${summary.kept} ya al día · ` +
        `${summary.entities} con entidades corregidas · ${summary.migrated} formatos migrados · ` +
        `${summary.blocked} sin migrar para no perder datos · ` +
        `${summary.skipped} intactos por estar aprobados/sellados/autorizados o con el evento cerrado · ` +
        `${summary.retired} plantillas retiradas` +
        (addAuditorio ? ` · ${summary.added} formatos agregados a eventos del Auditorio` : '') +
        `${summary.pdfErrors ? ` · ${summary.pdfErrors} PDFs con error` : ''}.`,
    );
    if (dry) console.log('Nada se escribió. Quita --dry para aplicar.');
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Paso 7: formatos del Auditorio que le faltan a cada evento abierto del
 * Auditorio. Igual que «Agregar formato» en el evento: encabezado desde el
 * evento, avance y PDF. Lo que el evento ya tiene no se toca.
 */
async function addAuditorioFormats(
  prisma: PrismaClient,
  pdfs: ChecklistPdfService,
  opts: {
    dry: boolean;
    tag: string;
    onlyEvent: string | null;
    includeSeed: boolean;
    summary: { added: number; pdfErrors: number };
  },
) {
  const { dry, tag, onlyEvent, includeSeed, summary } = opts;
  const formats = STANDARD_FORMATS.filter((f) => f.entities.includes(EntityKey.EXPLANADA));
  const events = await prisma.event.findMany({
    where: {
      entity: EntityKey.EXPLANADA,
      status: { notIn: [EventStatus.CLOSED, EventStatus.CANCELLED] },
      ...(onlyEvent ? { id: onlyEvent } : {}),
    },
    orderBy: { startsAt: 'asc' },
  });
  console.log(`\n${tag} Formatos del Auditorio en eventos abiertos (${events.length} evento(s) del Auditorio):`);
  if (onlyEvent && !events.length) {
    console.log(`${tag}   (el evento ${onlyEvent} no existe, no es del Auditorio o está cerrado/cancelado)`);
  }

  for (const ev of events) {
    if (!includeSeed && (SEED_TAG.test(ev.name) || SEED_TAG.test(ev.notes || ''))) {
      console.log(`${tag}   · ${ev.name}: demo [SEED_DEMO], se omite (--include-seed para incluirlo)`);
      continue;
    }
    for (const format of formats) {
      const template = await prisma.checklistTemplate.findFirst({ where: { key: format.key } });
      if (template && !template.active) {
        console.log(`${tag}   · ${ev.name} — ${template.name}: plantilla desactivada en Plantillas, no se agrega`);
        continue;
      }
      if (template) {
        const present = await prisma.checklistInstance.count({ where: { eventId: ev.id, templateId: template.id } });
        if (present) continue;
      }
      // En simulación una plantilla nueva todavía no existe: se usa la del catálogo.
      const schema = template ? template.schemaJson : format.schema;
      const dataJson = bindFormatToEvent(normalizeFormatData(schema), ev);
      const progressPct = calcProgress(dataJson);
      const title = template?.name ?? format.name;
      console.log(`${tag}   + ${ev.name} (${ev.id}) ← ${title} (avance ${progressPct}%)`);
      summary.added += 1;
      if (dry || !template) continue;

      const created = await prisma.checklistInstance.create({
        data: {
          eventId: ev.id,
          templateId: template.id,
          title,
          dataJson: dataJson as unknown as Prisma.InputJsonValue,
          progressPct,
          lastEditedAt: new Date(),
        },
      });
      await prisma.auditLog.create({
        data: {
          organizationId: ev.organizationId,
          action: 'template.instantiate',
          resource: 'ChecklistInstance',
          resourceId: created.id,
          metaJson: { eventId: ev.id, templateId: template.id, via: 'upgrade-format-templates --add-auditorio-formats' },
        },
      });
      try {
        await pdfs.regenerateInstance(created.id);
      } catch (e) {
        summary.pdfErrors += 1;
        console.error(`     ✗ PDF de ${title} (${created.id}): ${String(e)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
