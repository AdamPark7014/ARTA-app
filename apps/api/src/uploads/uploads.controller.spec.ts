import { ForbiddenException } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

describe('UploadsController · candado después de subir', () => {
  const ORG = 'org_arta_internal';
  const event = { id: 'ev1', name: 'Show', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG };
  const uploadedFile = {
    id: 'f1',
    eventId: 'ev1',
    checklistId: null,
    fileName: 'CAMPAÑA-Show.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    url: '/uploads/f1.xlsx',
    sizeBytes: 1024,
    kind: 'excel',
    module: 'campaign',
    version: 1,
    createdById: 'u-logistica',
    updatedById: 'u-logistica',
    sha256: 'abc',
    panelEditable: true,
    panelBlockReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    event,
    deletedAt: null,
    deletedById: null,
  };

  const user = (roleKey: string) => ({
    id: `u-${roleKey}`,
    roleKey,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [] as string[],
    organizationId: ORG,
  });

  function setup() {
    const prisma = {
      eventFile: {
        findUnique: async () => uploadedFile,
        update: async ({ data }: { data: Record<string, unknown> }) => ({ ...uploadedFile, ...data }),
      },
      auditLog: { create: async () => ({}) },
    };
    // Solo se usan en `remove`; mocks vacíos para la firma del ctor
    const revisions = { record: async () => ({}) };
    const xlsx = { inspectWorkbook: () => ({ editable: true, reason: null }) };
    const excelPdf = {};
    const financeExtract = { syncFromEventWorkbook: async () => undefined };
    const controller = new UploadsController(prisma as never, revisions as never, xlsx as never, excelPdf as never, financeExtract as never);
    return { controller };
  }

  it('bloquea eliminar a quien no es dirección si el archivo lo subió una persona', async () => {
    const { controller } = setup();
    await expect(controller.remove({ user: user('logistica') } as never, 'f1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('dirección sí puede borrar (soft-delete)', async () => {
    const { controller } = setup();
    const res = await controller.remove({ user: user('dir_general') } as never, 'f1');
    expect(res).toEqual({ ok: true, restorable: true });
  });
});

