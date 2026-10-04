import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DEFAULT_ORG_ID } from '../common/tenant';
import { ChecklistsController } from './checklists.controller';

/**
 * ChecklistTemplate no lleva organizationId: es un catálogo que comparten todas las organizaciones.
 * Ser dirección en otra organización no basta para crearlo, editarlo ni restaurarlo.
 */
describe('ChecklistsController · plantillas solo desde la organización de Arta', () => {
  const template = { id: 'tpl-1', name: 'Rider', version: 3, schemaJson: { sections: [] } };
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arta-tpl-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Lo que deja multer en disco antes de que corra el controlador. */
  function upload(name: string) {
    const path = join(dir, `subida-${name}`);
    writeFileSync(path, Buffer.from('PK\x03\x04 contenido', 'latin1'));
    return { path, originalname: name, filename: `subida-${name}` } as Express.Multer.File;
  }

  function setup() {
    const prisma = {
      checklistTemplate: {
        findMany: jest.fn(async () => [template]),
        findUnique: jest.fn(async () => ({ ...template, versions: [] })),
        create: jest.fn(async () => ({ id: 'tpl-nueva' })),
        update: jest.fn(async () => ({ ...template, version: 4 })),
      },
      checklistTemplateVersion: {
        findUnique: jest.fn(async () => ({ id: 'ver-1', templateId: 'tpl-1', version: 2, schemaJson: {} })),
        create: jest.fn(async () => ({})),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const controller = new ChecklistsController(prisma as never, {} as never, {} as never);
    return { controller, prisma };
  }

  const user = (organizationId: string, roleKey = 'dir_general') => ({
    user: { id: 'u-1', roleKey, entities: ['ARTA'], permissions: [], fullName: 'Dirección', organizationId },
  });
  const arta = user(DEFAULT_ORG_ID);
  const foreign = user('org_cliente_x');

  function expectNothingWritten(prisma: ReturnType<typeof setup>['prisma']) {
    expect(prisma.checklistTemplate.create).not.toHaveBeenCalled();
    expect(prisma.checklistTemplate.update).not.toHaveBeenCalled();
    expect(prisma.checklistTemplateVersion.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  }

  describe('dir_general de otra organización recibe 403', () => {
    it('POST templates', async () => {
      const { controller, prisma } = setup();
      await expect(controller.createTemplate(foreign, { name: 'Mía' })).rejects.toBeInstanceOf(ForbiddenException);
      expectNothingWritten(prisma);
    });

    it('PATCH templates/:id', async () => {
      const { controller, prisma } = setup();
      await expect(
        controller.updateTemplate(foreign, 'tpl-1', { schemaJson: { sections: [] } }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectNothingWritten(prisma);
    });

    it('POST templates/:id/restore/:versionId', async () => {
      const { controller, prisma } = setup();
      await expect(controller.restoreTemplateVersion(foreign, 'tpl-1', 'ver-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expectNothingWritten(prisma);
    });

    it('POST templates/import-docx, y borra el archivo que dejó multer', async () => {
      const { controller, prisma } = setup();
      const file = upload('formato.docx');
      await expect(controller.importDocxTemplate(foreign, file, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(existsSync(file.path)).toBe(false);
      expectNothingWritten(prisma);
    });

    it('POST templates/import-xlsx, y borra el archivo que dejó multer', async () => {
      const { controller, prisma } = setup();
      const file = upload('formato.xlsx');
      await expect(controller.importXlsxTemplate(foreign, file, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(existsSync(file.path)).toBe(false);
      expectNothingWritten(prisma);
    });

    it('POST templates/:id/excel, y borra el archivo que dejó multer', async () => {
      const { controller, prisma } = setup();
      const file = upload('base.xlsx');
      await expect(controller.replaceTemplateExcel(foreign, 'tpl-1', file)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(existsSync(file.path)).toBe(false);
      expectNothingWritten(prisma);
    });
  });

  describe('dir_general de org_arta_internal sigue pudiendo', () => {
    it('crear', async () => {
      const { controller, prisma } = setup();
      await expect(controller.createTemplate(arta, { name: 'Nueva' })).resolves.toEqual({ id: 'tpl-nueva' });
      expect(prisma.checklistTemplate.create).toHaveBeenCalledTimes(1);
    });

    it('editar el esquema (guarda snapshot y sube versión)', async () => {
      const { controller, prisma } = setup();
      await controller.updateTemplate(arta, 'tpl-1', { schemaJson: { sections: [] } });
      expect(prisma.checklistTemplateVersion.create).toHaveBeenCalledTimes(1);
      expect(prisma.checklistTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tpl-1' }, data: expect.objectContaining({ version: 4 }) }),
      );
    });

    it('restaurar una versión', async () => {
      const { controller, prisma } = setup();
      await controller.restoreTemplateVersion(arta, 'tpl-1', 'ver-1');
      expect(prisma.checklistTemplate.update).toHaveBeenCalledTimes(1);
    });

    it('importar un Excel como plantilla', async () => {
      const { controller, prisma } = setup();
      await controller.importXlsxTemplate(arta, upload('campana.xlsx'), {});
      expect(prisma.checklistTemplate.create).toHaveBeenCalledTimes(1);
    });

    it('reemplazar el Excel base', async () => {
      const { controller, prisma } = setup();
      await controller.replaceTemplateExcel(arta, 'tpl-1', upload('base.xlsx'));
      expect(prisma.checklistTemplate.update).toHaveBeenCalledTimes(1);
    });

    it('importar Word pasa el candado de organización (sin archivo cae en la validación de siempre)', async () => {
      const { controller } = setup();
      await expect(
        controller.importDocxTemplate(arta, undefined as unknown as Express.Multer.File, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('super_admin puede editar desde cualquier organización', async () => {
    const { controller, prisma } = setup();
    await controller.createTemplate(user('org_cliente_x', 'super_admin'), { name: 'Plataforma' });
    expect(prisma.checklistTemplate.create).toHaveBeenCalledTimes(1);
  });

  it('las lecturas no cambian: otra organización sigue listando plantillas activas', async () => {
    const { controller, prisma } = setup();
    await expect(controller.templates(foreign)).resolves.toEqual([template]);
    expect(prisma.checklistTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }));
  });
});
