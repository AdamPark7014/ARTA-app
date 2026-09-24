/**
 * Genera campaña y/o corrida estándar para eventos que todavía no tienen archivo.
 *
 * Uso:
 *   ts-node --transpile-only apps/api/scripts/generate-missing-campaign-and-corrida.ts [--dry] [--confirm-produccion]
 *
 * Política:
 * - NUNCA sobrescribe: solo cuando no hay EventFile (module 'campaign' o 'finance').
 * - La campaña toma conceptos de Campaign.dataJson.concepts si existen; si no, hoja vacía.
 * - La corrida solo pega el nombre del evento en el machote.
 */
import { PrismaClient } from '@prisma/client';
import { join } from 'path';
import { uploadRoot } from '../src/uploads/upload-storage';
import { CampaignExcelService, type CampaignRow } from '../src/campaigns/campaign-excel.service';
import { FinanceExcelService } from '../src/finance/finance-excel.service';
import { ExcelPdfService } from '../src/uploads/excel-pdf.service';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const prisma = new PrismaClient();
  const DRY = has('dry') || !has('confirm-produccion');
  const CONFIRM = has('confirm-produccion');
  const actorArg = (() => {
    const pref = '--actor=';
    const arg = process.argv.find((a) => a.startsWith(pref));
    if (arg) return arg.slice(pref.length);
    const i = process.argv.indexOf('--actor');
    if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
    return null;
  })();
  let actorId: string | null = null;
  if (!DRY) {
    if (!actorArg) {
      console.log('Falta --actor <email> (quién ejecuta). Aborta para no crear archivos sin autor.');
      process.exit(2);
    }
    const actor = await prisma.user.findFirst({ where: { email: actorArg }, select: { id: true, fullName: true } });
    if (!actor) {
      console.log(`Usuario no encontrado: ${actorArg}`);
      process.exit(2);
    }
    actorId = actor.id;
    // Stash for PDF author metadata
    (global as any).__ARTA_ACTOR_FULLNAME__ = actor.fullName || null;
  }

  const campaignSrc = join(uploadRoot, 'format-campaign.xlsx');
  const corridaSrc = join(uploadRoot, 'format-corrida.xlsx');
  const campaignSvc = new CampaignExcelService();
  const corridaSvc = new FinanceExcelService();
  const pdfSvc = new ExcelPdfService();

  let madeCampaign = 0;
  let madeCorrida = 0;

  const events = await prisma.event.findMany({
    select: {
      id: true,
      name: true,
      notes: true,
      entity: true,
      organizationId: true,
      startsAt: true,
      venue: true,
      city: true,
      promoter: true,
    },
  });
  for (const event of events) {
    // Saltar eventos de demo por defecto
    const seedTagged =
      (event.name && /\[SEED_DEMO\]/i.test(event.name)) ||
      (event.notes && /\[SEED_DEMO\]/i.test(event.notes));
    if (!has('include-seed') && seedTagged) continue;
    const files = await prisma.eventFile.findMany({
      where: { eventId: event.id, deletedAt: null },
      select: { id: true, module: true },
    });
    const hasCampaign = files.some((f) => f.module === 'campaign');
    const hasCorrida = files.some((f) => f.module === 'finance');

    // Campaña
    if (!hasCampaign) {
      const campaign = await prisma.campaign.findUnique({ where: { eventId: event.id } });
      const rows = Array.isArray((campaign?.dataJson as any)?.concepts)
        ? ((campaign?.dataJson as any).concepts as CampaignRow[])
        : [];
      console.log(`${DRY ? '· DRY ' : ''}Generar campaña para «${event.name}» (${rows.length} conceptos)`);
      if (!DRY) {
        const { excelPath } = await campaignSvc.buildFromTemplate(
          campaignSrc,
          {
            eventName: event.name,
            venue: event.venue || '',
            city: event.city || '',
            date: event.startsAt ? new Date(event.startsAt).toLocaleDateString('es-MX') : '',
            schedule: '',
            promoter: event.promoter || '',
          },
          rows,
        );
        const buf = readFileSync(excelPath);
        const name = `CAMPANA ${event.name}.xlsx`;
        // choose an author: first direction user in org (fallback: any active)
        const author =
          (await prisma.user.findFirst({
            where: {
              active: true,
              organizationId: event.organizationId ?? undefined,
              roleKey: { in: ['dir_general', 'dir_adjunta', 'super_admin'] },
            },
            select: { id: true, fullName: true },
          })) ||
          (await prisma.user.findFirst({ where: { active: true }, select: { id: true, fullName: true } }));
        const file = await prisma.eventFile.create({
          data: {
            eventId: event.id,
            fileName: name,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            url: `/uploads/${excelPath.split('/').pop()}`,
            kind: 'excel',
            module: 'campaign',
            createdById: actorId,
            updatedById: actorId,
            sha256: createHash('sha256').update(buf).digest('hex'),
          },
        });
        await pdfSvc.generate(file.id, file.version, excelPath, {
          eventName: event.name,
          entity: event.entity,
          fileName: name,
          exportedBy: ((global as any).__ARTA_ACTOR_FULLNAME__ as string) || author?.fullName || null,
        });
      }
      madeCampaign += 1;
    }

    // Corrida
    if (!hasCorrida) {
      console.log(`${DRY ? '· DRY ' : ''}Generar corrida para «${event.name}»`);
      if (!DRY) {
        const { excelPath } = await corridaSvc.buildFromTemplate(corridaSrc, event.name);
        const buf = readFileSync(excelPath);
        const name = `CORRIDA ${event.name}.xlsx`;
        const author =
          (await prisma.user.findFirst({
            where: {
              active: true,
              organizationId: event.organizationId ?? undefined,
              roleKey: { in: ['dir_general', 'dir_adjunta', 'super_admin'] },
            },
            select: { id: true, fullName: true },
          })) ||
          (await prisma.user.findFirst({ where: { active: true }, select: { id: true, fullName: true } }));
        const excelFile = await prisma.eventFile.create({
          data: {
            eventId: event.id,
            fileName: name,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            url: `/uploads/${excelPath.split('/').pop()}`,
            kind: 'excel',
            module: 'finance',
            createdById: actorId,
            updatedById: actorId,
            sha256: createHash('sha256').update(buf).digest('hex'),
          },
        });
        await pdfSvc.generate(excelFile.id, excelFile.version, excelPath, {
          eventName: event.name,
          entity: event.entity,
          fileName: name,
          exportedBy: ((global as any).__ARTA_ACTOR_FULLNAME__ as string) || author?.fullName || null,
        });
      }
      madeCorrida += 1;
    }
  }

  console.log(`Listo. Campañas creadas: ${madeCampaign}. Corridas creadas: ${madeCorrida}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

