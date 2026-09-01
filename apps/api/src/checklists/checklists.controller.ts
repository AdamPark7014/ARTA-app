import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { calcProgress } from '../common/checklist-progress';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import {
  canAccessEventOps,
  hasPermission,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';
import { ChecklistPdfService } from './checklist-pdf.service';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions?: string[];
  fullName: string;
  organizationId?: string | null;
};

type SigBody = {
  kind: 'ENTREGADO' | 'AUTORIZADO';
  imageDataUrl: string;
  signerName?: string;
};

@Controller('checklists')
@UseGuards(JwtAuthGuard)
export class ChecklistsController {
  constructor(
    private prisma: PrismaService,
    private pdfs: ChecklistPdfService,
  ) {}

  private assertEventAccess(user: AuthUser, event: { entity: string; organizationId?: string | null; status?: string }) {
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(user, event.organizationId);
  }

  private assertChecklistEdit(user: AuthUser) {
    if (
      !hasPermission(
        user.roleKey as RoleKey,
        user.permissions || [],
        PERMISSIONS.CHECKLIST_EDIT,
      )
    ) {
      throw new ForbiddenException('Sin permiso para editar checklists');
    }
  }

  private async regeneratePdf(id: string, options?: { force?: boolean }) {
    return this.pdfs.regenerateInstance(id, options);
  }

  @Get('templates')
  templates(
    @Req() req: { user: AuthUser },
    @Query('all') all?: string,
  ) {
    const canManage =
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.USERS_MANAGE) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.EVERYTHING) ||
      req.user.roleKey === 'gerente_arta' ||
      req.user.roleKey === 'dir_auditorio';

    if (all === '1' && !canManage) {
      throw new ForbiddenException('Sin permiso para ver todas las plantillas');
    }

    return this.prisma.checklistTemplate.findMany({
      where: all === '1' ? undefined : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('templates/:id')
  async templateOne(@Param('id') id: string) {
    const t = await this.prisma.checklistTemplate.findUnique({
      where: { id },
      include: {
        versions: {
          take: 30,
          orderBy: { createdAt: 'desc' },
          include: { editedBy: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!t) throw new BadRequestException('Plantilla no encontrada');
    return t;
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      active?: boolean;
      schemaJson?: object;
      note?: string;
    },
  ) {
    const canManage =
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.USERS_MANAGE) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.EVERYTHING) ||
      req.user.roleKey === 'gerente_arta' ||
      req.user.roleKey === 'dir_auditorio';
    if (!canManage) throw new ForbiddenException('Sin permiso para editar plantillas');

    const existing = await this.prisma.checklistTemplate.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Plantilla no encontrada');

    if (body.schemaJson) {
      await this.prisma.checklistTemplateVersion.create({
        data: {
          templateId: id,
          schemaJson: existing.schemaJson as Prisma.InputJsonValue,
          version: existing.version,
          note: body.note || `Snapshot v${existing.version} antes de editar`,
          editedById: req.user.id,
        },
      });
    }

    const updated = await this.prisma.checklistTemplate.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        active: body.active,
        schemaJson: body.schemaJson as Prisma.InputJsonValue | undefined,
        version: body.schemaJson ? existing.version + 1 : undefined,
      },
    });

    if (body.schemaJson) {
      await this.prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'template.schema.update',
          resource: 'ChecklistTemplate',
          resourceId: id,
          metaJson: { fromVersion: existing.version, toVersion: updated.version },
        },
      });
    }

    return this.templateOne(id);
  }

  @Post('templates/:id/restore/:versionId')
  async restoreTemplateVersion(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    const canManage =
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.USERS_MANAGE) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.EVERYTHING) ||
      req.user.roleKey === 'gerente_arta' ||
      req.user.roleKey === 'dir_auditorio';
    if (!canManage) throw new ForbiddenException('Sin permiso para restaurar plantillas');

    const existing = await this.prisma.checklistTemplate.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Plantilla no encontrada');

    const version = await this.prisma.checklistTemplateVersion.findUnique({ where: { id: versionId } });
    if (!version || version.templateId !== id) {
      throw new BadRequestException('Versión no encontrada');
    }

    await this.prisma.checklistTemplateVersion.create({
      data: {
        templateId: id,
        schemaJson: existing.schemaJson as Prisma.InputJsonValue,
        version: existing.version,
        note: `Backup antes de restaurar v${version.version}`,
        editedById: req.user.id,
      },
    });

    await this.prisma.checklistTemplate.update({
      where: { id },
      data: {
        schemaJson: version.schemaJson as Prisma.InputJsonValue,
        version: existing.version + 1,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'template.restore',
        resource: 'ChecklistTemplate',
        resourceId: id,
        metaJson: { versionId, restoredFrom: version.version },
      },
    });

    return this.templateOne(id);
  }

  @Get('event/:eventId')
  async byEvent(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new BadRequestException('Evento no encontrado');
    this.assertEventAccess(req.user, event);
    return this.prisma.checklistInstance.findMany({
      where: { eventId },
      include: {
        template: true,
        lastEditedBy: { select: { id: true, fullName: true, email: true } },
        deliveredBy: { select: { id: true, fullName: true } },
        authorizedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { title: 'asc' },
    });
  }

  @Get(':id')
  async get(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const item = await this.prisma.checklistInstance.findUnique({
      where: { id },
      include: {
        template: true,
        event: true,
        lastEditedBy: { select: { id: true, fullName: true, email: true } },
        deliveredBy: { select: { id: true, fullName: true } },
        authorizedBy: { select: { id: true, fullName: true } },
        versions: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { editedBy: { select: { id: true, fullName: true } } },
        },
        signatures: { orderBy: { signedAt: 'desc' } },
        files: true,
      },
    });
    if (!item) throw new BadRequestException('Checklist no encontrado');
    this.assertEventAccess(req.user, item.event);
    return item;
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      dataJson: object;
      note?: string;
      /** `false` en autoguardados: regenerar el PDF en cada tecleo era carísimo. */
      regeneratePdf?: boolean;
      /** Autoguardado: no crea versión ni entrada de auditoría. */
      draft?: boolean;
    },
  ) {
    const existing = await this.prisma.checklistInstance.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new BadRequestException('Checklist no encontrado');
    this.assertEventAccess(req.user, existing.event);
    this.assertChecklistEdit(req.user);
    assertEventNotClosed(existing.event.status);

    const progressPct = calcProgress(body.dataJson);
    const draft = body.draft === true;

    const updated = await this.prisma.checklistInstance.update({
      where: { id },
      data: {
        dataJson: body.dataJson as Prisma.InputJsonValue,
        progressPct,
        lastEditedById: req.user.id,
        lastEditedAt: new Date(),
      },
      include: {
        template: true,
        lastEditedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    // El historial se llena con guardados explícitos: si cada autoguardado
    // dejara versión, el historial sería ilegible y la tabla crecería sola.
    if (!draft) {
      await this.prisma.checklistVersion.create({
        data: {
          instanceId: id,
          dataJson: body.dataJson as Prisma.InputJsonValue,
          editedById: req.user.id,
          note: body.note,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'checklist.update',
          resource: 'ChecklistInstance',
          resourceId: id,
          metaJson: { progressPct, note: body.note ?? null },
        },
      });
    }

    // El PDF se regenera al guardar de verdad, no en cada autoguardado.
    if (draft || body.regeneratePdf === false) return updated;
    return this.regeneratePdf(id);
  }

  @Post(':id/sign')
  async sign(
    @Req() req: { user: AuthUser; ip?: string; headers: Record<string, string> },
    @Param('id') id: string,
    @Body() body: SigBody,
  ) {
    if (!body?.imageDataUrl || !body.kind) {
      throw new BadRequestException('Firma requerida');
    }
    if (!['ENTREGADO', 'AUTORIZADO'].includes(body.kind)) {
      throw new BadRequestException('Tipo de firma inválido');
    }

    const existing = await this.prisma.checklistInstance.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new BadRequestException('Checklist no encontrado');
    this.assertEventAccess(req.user, existing.event);
    this.assertChecklistEdit(req.user);
    assertEventNotClosed(existing.event.status);

    // Autorizar: gerencia en Arta / dirección del Auditorio / dirección general
    if (body.kind === 'AUTORIZADO') {
      const role = req.user.roleKey;
      const entity = existing.event.entity;
      const allowed =
        role === 'dir_general' ||
        role === 'super_admin' ||
        (role === 'gerente_arta' && entity === 'ARTA') ||
        (role === 'dir_auditorio' && entity === 'EXPLANADA');
      if (!allowed) {
        throw new ForbiddenException('No puedes firmar como Autorizado en esta entidad');
      }
    }

    const signerName = body.signerName?.trim() || req.user.fullName;
    const signedAt = new Date();
    const signaturePayload = {
      signerName,
      imageDataUrl: body.imageDataUrl,
      signedAt: signedAt.toISOString(),
      userId: req.user.id,
    };

    await this.prisma.digitalSignature.create({
      data: {
        checklistId: id,
        kind: body.kind,
        signerName,
        signerUserId: req.user.id,
        imageDataUrl: body.imageDataUrl,
        signedAt,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
    });

    if (body.kind === 'ENTREGADO') {
      await this.prisma.checklistInstance.update({
        where: { id },
        data: {
          deliveredAt: signedAt,
          deliveredById: req.user.id,
          deliveredSignature: signaturePayload,
          lastEditedById: req.user.id,
          lastEditedAt: signedAt,
        },
      });
    } else {
      await this.prisma.checklistInstance.update({
        where: { id },
        data: {
          authorizedAt: signedAt,
          authorizedById: req.user.id,
          authorizedSignature: signaturePayload,
          lastEditedById: req.user.id,
          lastEditedAt: signedAt,
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: `checklist.sign.${body.kind.toLowerCase()}`,
        resource: 'ChecklistInstance',
        resourceId: id,
        metaJson: { signerName },
      },
    });

    // Único caso que fuerza la reimpresión de un formato autorizado: la firma
    // que acaba de registrarse tiene que quedar dentro del PDF.
    return this.regeneratePdf(id, { force: true });
  }

  @Post(':id/pdf')
  async forcePdf(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const existing = await this.prisma.checklistInstance.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new BadRequestException('Checklist no encontrado');
    this.assertEventAccess(req.user, existing.event);
    // Regenerar el PDF reescribe el archivo del formato: no es una lectura.
    // Antes bastaba con poder ver el evento.
    this.assertChecklistEdit(req.user);
    assertEventNotClosed(existing.event.status);
    // `regenerateForEvent` ya protege los formatos firmados; esta puerta no lo
    // hacía, así que se podía reimprimir un documento ya autorizado.
    if (existing.authorizedAt || existing.authorizedSignature) {
      throw new ForbiddenException(
        'Formato autorizado — no se reimprime. Restaura una versión si necesitas cambiarlo.',
      );
    }
    return this.regeneratePdf(id);
  }

  @Post(':id/restore/:versionId')
  async restoreVersion(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    const existing = await this.prisma.checklistInstance.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new BadRequestException('Checklist no encontrado');
    this.assertEventAccess(req.user, existing.event);
    this.assertChecklistEdit(req.user);
    assertEventNotClosed(existing.event.status);

    const version = await this.prisma.checklistVersion.findUnique({ where: { id: versionId } });
    if (!version || version.instanceId !== id) {
      throw new BadRequestException('Versión no encontrada');
    }

    const dataJson = version.dataJson as object;
    const progressPct = calcProgress(dataJson);

    await this.prisma.checklistInstance.update({
      where: { id },
      data: {
        dataJson: dataJson as Prisma.InputJsonValue,
        progressPct,
        lastEditedById: req.user.id,
        lastEditedAt: new Date(),
      },
    });

    await this.prisma.checklistVersion.create({
      data: {
        instanceId: id,
        dataJson: dataJson as Prisma.InputJsonValue,
        editedById: req.user.id,
        note: `Restaurada versión ${versionId.slice(0, 8)}`,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'checklist.restore',
        resource: 'ChecklistInstance',
        resourceId: id,
        metaJson: { versionId },
      },
    });

    return this.regeneratePdf(id);
  }

  @Post('event/:eventId/from-template')
  async createFromTemplate(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
    @Body() body: { templateId: string; title?: string },
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new BadRequestException('Evento no encontrado');
    this.assertEventAccess(req.user, event);
    this.assertChecklistEdit(req.user);
    assertEventNotClosed(event.status);
    const template = await this.prisma.checklistTemplate.findUnique({
      where: { id: body.templateId },
    });
    if (!template) throw new BadRequestException('Plantilla no encontrada');

    const created = await this.prisma.checklistInstance.create({
      data: {
        eventId,
        templateId: template.id,
        title: body.title || template.name,
        dataJson: template.schemaJson as Prisma.InputJsonValue,
        progressPct: 0,
        lastEditedById: req.user.id,
        lastEditedAt: new Date(),
      },
    });

    // Generar PDF base al crear desde plantilla
    return this.regeneratePdf(created.id);
  }
}
