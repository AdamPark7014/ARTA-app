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
import { DocStatus, DocType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { PrismaService } from '../common/prisma/prisma.service';
import { calcProgress } from '../common/checklist-progress';
import { diffChecklistData } from '../common/doc-diff';
import { bindFormatToEvent, normalizeFormatData, type FormatData, type FormatItem, type FormatSection } from '../common/format-schema';
import {
  actorFrom,
  RevisionConflictException,
  RevisionService,
} from '../common/revisions/revision.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { MULTER_OPTIONS, contentMatchesExtension, discardUpload, uploadRoot } from '../uploads/upload-storage';
import {
  assertCanReopen,
  assertCanTransition,
  assertDocWritable,
  assertTransitionAllowed,
  DOC_STATUS_LABEL,
} from '../common/doc-guards';
import {
  canAccessEventOps,
  hasPermission,
  isDirectionRole,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';
import { ChecklistPdfService } from './checklist-pdf.service';
import { VISIBLE_CHECKLIST_WHERE } from './checklist-visibility';
import { NotificationsService } from '../notifications/notifications.service';
import { Optional } from '@nestjs/common';

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
    private revisions: RevisionService,
    @Optional() private notifications?: NotificationsService,
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
      isDirectionRole(req.user.roleKey) ||
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

  /** Crear plantilla nueva (desde cero, editable con el editor de esquema). */
  @Post('templates')
  async createTemplate(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      name: string;
      description?: string;
      entities?: EntityKey[];
      schemaJson?: object;
      active?: boolean;
    },
  ) {
    const canManage =
      isDirectionRole(req.user.roleKey) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.USERS_MANAGE) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.EVERYTHING) ||
      req.user.roleKey === 'gerente_arta' ||
      req.user.roleKey === 'dir_auditorio';
    if (!canManage) throw new ForbiddenException('Sin permiso para crear plantillas');
    const name = (body?.name || '').trim();
    if (!name) throw new BadRequestException('Nombre requerido');
    const created = await this.prisma.checklistTemplate.create({
      data: {
        key: 'CUSTOM',
        name,
        description: body?.description?.trim() || null,
        entities: Array.isArray(body?.entities) ? (body!.entities as EntityKey[]) : [],
        schemaJson: (body?.schemaJson || { sections: [] }) as Prisma.InputJsonValue,
        active: body?.active !== false,
      } as any,
    });
    await this.prisma.auditLog.create({
      data: { userId: req.user.id, action: 'template.create', resource: 'ChecklistTemplate', resourceId: created.id, metaJson: { name } },
    });
    return created;
  }

  /** Importar .docx → plantilla checklist (secciones del Word, párrafos «Etiqueta:» a campos, listas a casillas, tablas a tabla). */
  @Post('templates/import-docx')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async importDocxTemplate(
    @Req() req: { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string; description?: string; entities?: EntityKey[] },
  ) {
    const canManage =
      isDirectionRole(req.user.roleKey) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.USERS_MANAGE) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.EVERYTHING) ||
      req.user.roleKey === 'gerente_arta' ||
      req.user.roleKey === 'dir_auditorio';
    if (!canManage) throw new ForbiddenException('Sin permiso para crear plantillas');
    if (!file) throw new BadRequestException('Archivo .docx requerido');
    if (!/\.docx$/i.test(file.originalname) || !contentMatchesExtension(file.path, file.originalname)) {
      discardUpload(file.path);
      throw new BadRequestException('Solo se importa Word (.docx)');
    }
    let html = '';
    try {
      const result = await mammoth.convertToHtml({ buffer: readFileSync(file.path) });
      html = result.value || '';
    } catch {
      discardUpload(file.path);
      throw new BadRequestException('No se pudo leer el Word');
    }
    discardUpload(file.path);
    const schema = this.docxHtmlToSchema(html);
    const created = await this.prisma.checklistTemplate.create({
      data: {
        key: 'CUSTOM',
        name: (body?.name || file.originalname.replace(/\.docx$/i, '')).slice(0, 120),
        description: body?.description?.trim() || null,
        entities: Array.isArray(body?.entities) ? (body!.entities as EntityKey[]) : [],
        schemaJson: schema as unknown as Prisma.InputJsonValue,
        active: true,
      } as any,
    });
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'template.import.docx',
        resource: 'ChecklistTemplate',
        resourceId: created.id,
        metaJson: { fileName: file.originalname },
      },
    });
    return created;
  }

  /** Importar .xlsx como plantilla Excel: se copiará el libro en cada evento. */
  @Post('templates/import-xlsx')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async importXlsxTemplate(
    @Req() req: { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string; description?: string; entities?: EntityKey[] },
  ) {
    const canManage =
      isDirectionRole(req.user.roleKey) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.USERS_MANAGE) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.EVERYTHING) ||
      req.user.roleKey === 'gerente_arta' ||
      req.user.roleKey === 'dir_auditorio';
    if (!canManage) throw new ForbiddenException('Sin permiso para crear plantillas');
    if (!file) throw new BadRequestException('Archivo .xlsx requerido');
    if (!/\.xlsx$/i.test(file.originalname) || !contentMatchesExtension(file.path, file.originalname)) {
      discardUpload(file.path);
      throw new BadRequestException('Solo se importa Excel (.xlsx)');
    }
    // Guardado ya ocurrió (multer). Se referencia en la plantilla.
    const url = `/uploads/${file.filename}`;
    const created = await this.prisma.checklistTemplate.create({
      data: {
        key: 'CUSTOM',
        name: (body?.name || file.originalname.replace(/\.xlsx$/i, '')).slice(0, 120),
        description: body?.description?.trim() || null,
        entities: Array.isArray(body?.entities) ? (body!.entities as EntityKey[]) : [],
        schemaJson: { sections: [] } as Prisma.InputJsonValue,
        active: true,
        // prisma types may be stale during development — cast away
        ...( { excelTemplateUrl: url } as any ),
      } as any,
    });
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'template.import.xlsx',
        resource: 'ChecklistTemplate',
        resourceId: created.id,
        metaJson: { fileName: file.originalname, url },
      },
    });
    return created;
  }

  /** Reemplazar el .xlsx base de una plantilla Excel existente. */
  @Post('templates/:id/excel')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async replaceTemplateExcel(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const canManage =
      isDirectionRole(req.user.roleKey) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.USERS_MANAGE) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions || [], PERMISSIONS.EVERYTHING) ||
      req.user.roleKey === 'gerente_arta' ||
      req.user.roleKey === 'dir_auditorio';
    if (!canManage) throw new ForbiddenException('Sin permiso para editar plantillas');
    const existing = await this.prisma.checklistTemplate.findUnique({ where: { id } });
    if (!existing) {
      if (file) discardUpload(file.path);
      throw new BadRequestException('Plantilla no encontrada');
    }
    if (!file) throw new BadRequestException('Archivo .xlsx requerido');
    if (!/\.xlsx$/i.test(file.originalname) || !contentMatchesExtension(file.path, file.originalname)) {
      discardUpload(file.path);
      throw new BadRequestException('Solo se reemplaza con Excel (.xlsx)');
    }
    const url = `/uploads/${file.filename}`;
    const updated = await this.prisma.checklistTemplate.update({
      where: { id },
      data: { ...( { excelTemplateUrl: url } as any) },
    });
    await this.prisma.auditLog.create({
      data: { userId: req.user.id, action: 'template.excel.replace', resource: 'ChecklistTemplate', resourceId: id, metaJson: { fileName: file.originalname, url } },
    });
    return updated;
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
      where: { eventId, AND: [VISIBLE_CHECKLIST_WHERE] },
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
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> },
    @Param('id') id: string,
    @Body()
    body: {
      dataJson: object;
      note?: string;
      /** `false` en autoguardados: regenerar el PDF en cada tecleo era carísimo. */
      regeneratePdf?: boolean;
      /** Autoguardado: no crea revisión ni entrada de auditoría. */
      draft?: boolean;
      /**
       * Revisión sobre la que se editó. Si el servidor va por otra, alguien
       * guardó mientras tanto y se responde 409 con el diff en vez de pisarlo.
       * Opcional por compatibilidad: sin él se mantiene el comportamiento
       * anterior (último en escribir gana).
       */
      baseRevision?: number;
    },
  ) {
    const existing = await this.prisma.checklistInstance.findUnique({
      where: { id },
      include: { event: true, lastEditedBy: { select: { fullName: true } } },
    });
    if (!existing) throw new BadRequestException('Checklist no encontrado');
    this.assertEventAccess(req.user, existing.event);
    this.assertChecklistEdit(req.user);
    // Oráculo único: estado del documento + estado del evento, en un solo sitio.
    assertDocWritable(existing, existing.event);

    /*
     * Sin contenido no hay nada que guardar — y sí mucho que romper: con
     * `dataJson` ausente, Prisma se salta el campo pero `calcProgress` habría
     * devuelto 0 y el avance del formato se iba a cero sin que cambiara una
     * sola casilla. Se cierra aquí porque protege contra cualquier cliente,
     * no solo contra el panel.
     */
    if (!body.dataJson || typeof body.dataJson !== 'object') {
      throw new BadRequestException('Falta el contenido del formato (dataJson)');
    }

    const progressPct = calcProgress(body.dataJson);
    const draft = body.draft === true;
    const base = body.baseRevision;

    /*
     * UPDATE atómico con el número de revisión en el WHERE: si otra petición
     * se adelantó, no casa ninguna fila y `count` viene en 0. El contador es a
     * la vez historial y candado, así que no hace falta un `SELECT ... FOR
     * UPDATE` aparte.
     */
    const { count } = await this.prisma.checklistInstance.updateMany({
      where: { id, ...(base !== undefined ? { revision: base } : {}) },
      data: {
        dataJson: body.dataJson as Prisma.InputJsonValue,
        progressPct,
        lastEditedById: req.user.id,
        lastEditedAt: new Date(),
        revision: { increment: 1 },
      },
    });

    if (!count) {
      const current = await this.prisma.checklistInstance.findUnique({
        where: { id },
        include: { lastEditedBy: { select: { fullName: true } } },
      });
      throw new RevisionConflictException({
        currentRevision: current?.revision ?? existing.revision,
        diff: diffChecklistData(body.dataJson, current?.dataJson),
        theirs: current?.dataJson,
        author: current?.lastEditedBy?.fullName ?? null,
      });
    }

    const updated = await this.prisma.checklistInstance.findUniqueOrThrow({
      where: { id },
      include: {
        template: true,
        lastEditedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    // El historial se llena con guardados explícitos: si cada autoguardado
    // dejara revisión, el historial sería ilegible y la tabla crecería sola.
    if (!draft) {
      const diff = diffChecklistData(existing.dataJson, body.dataJson);

      await this.revisions.record({
        organizationId: existing.event.organizationId || '(sin-organizacion)',
        eventId: existing.eventId,
        docType: DocType.CHECKLIST,
        docId: id,
        revision: updated.revision,
        snapshotJson: body.dataJson,
        diff,
        note: body.note ?? null,
        actor: actorFrom(req),
      });

      await this.prisma.auditLog.create({
        data: {
          userId: req.user.id,
          organizationId: existing.event.organizationId,
          action: 'checklist.update',
          resource: 'ChecklistInstance',
          resourceId: id,
          metaJson: { progressPct, note: body.note ?? null, changes: diff.summary },
          ip: req.ip,
          userAgent: req.headers?.['user-agent']?.slice(0, 300),
        },
      });
    }

    // El PDF se regenera al guardar de verdad, no en cada autoguardado.
    if (draft || body.regeneratePdf === false) return updated;
    return this.regeneratePdf(id);
  }

  /** Historial de revisiones del formato, con el diff ya calculado. */
  @Get(':id/revisions')
  async revisionHistory(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const item = await this.prisma.checklistInstance.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!item) throw new BadRequestException('Checklist no encontrado');
    this.assertEventAccess(req.user, item.event);
    return this.revisions.history(DocType.CHECKLIST, id);
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
    assertDocWritable(existing, existing.event);

    // Autorizar: gerencia en Arta / dirección del Auditorio / dirección general
    if (body.kind === 'AUTORIZADO') {
      const role = req.user.roleKey;
      const entity = existing.event.entity;
      const allowed =
        isDirectionRole(role) ||
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
        // Prueba de QUÉ se firmó: sin esto no se puede demostrar que el
        // documento actual sea el que alguien autorizó.
        contentHash: createHash('sha256')
          .update(JSON.stringify(existing.dataJson ?? null))
          .digest('hex'),
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

  /**
   * Cambiar el estado del formato: Borrador → Revisión → Aprobado → Sellado.
   *
   * Pedir revisión es autoservicio; aprobar y sellar son de gerencia/dirección;
   * reabrir algo sellado es solo de dirección y **con motivo por escrito**, que
   * queda en el historial. Cada transición deja su propia revisión.
   */
  @Post(':id/status')
  async changeStatus(
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> },
    @Param('id') id: string,
    @Body() body: { status: DocStatus; reason?: string },
  ) {
    const to = body?.status;
    if (!to || !Object.values(DocStatus).includes(to)) {
      throw new BadRequestException('Estado inválido');
    }

    const existing = await this.prisma.checklistInstance.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new BadRequestException('Checklist no encontrado');
    this.assertEventAccess(req.user, existing.event);
    this.assertChecklistEdit(req.user);
    assertEventNotClosed(existing.event.status);

    const from = existing.status;
    assertTransitionAllowed(from, to);

    const reopening = from === DocStatus.SEALED;
    if (reopening) assertCanReopen(req.user.roleKey, body.reason || '');
    else assertCanTransition(req.user.roleKey, to, body.reason);

    const now = new Date();
    const updated = await this.prisma.checklistInstance.update({
      where: { id },
      data: {
        status: to,
        revision: { increment: 1 },
        ...(to === DocStatus.REVIEW ? { submittedById: req.user.id, submittedAt: now } : {}),
        ...(to === DocStatus.APPROVED ? { approvedById: req.user.id, approvedAt: now } : {}),
        ...(to === DocStatus.SEALED ? { sealedById: req.user.id, sealedAt: now } : {}),
        ...(reopening ? { reopenReason: body.reason, sealedAt: null, sealedById: null } : {}),
      },
      include: {
        template: true,
        lastEditedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    await this.revisions.record({
      organizationId: existing.event.organizationId || '(sin-organizacion)',
      eventId: existing.eventId,
      docType: DocType.CHECKLIST,
      docId: id,
      revision: updated.revision,
      fromStatus: from,
      toStatus: to,
      note: reopening
        ? `Reabierto: ${body.reason}`
        : `${DOC_STATUS_LABEL[from]} → ${DOC_STATUS_LABEL[to]}`,
      actor: actorFrom(req as never),
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: existing.event.organizationId,
        action: reopening ? 'checklist.reopen' : `checklist.status.${to.toLowerCase()}`,
        resource: 'ChecklistInstance',
        resourceId: id,
        metaJson: { from, to, reason: body.reason ?? null },
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });

    await this.notifyStatusChange(req.user, existing, from, to, reopening).catch(() => undefined);
    return updated;
  }

  /**
   * Enviar a revisión avisa a quien aprueba en esa entidad; aprobar, sellar,
   * regresar a borrador o reabrir avisa a quien lo mandó a revisión.
   */
  private async notifyStatusChange(
    actor: AuthUser,
    doc: {
      id: string;
      title: string;
      eventId: string;
      submittedById: string | null;
      event: { name: string; entity: string; organizationId: string | null };
    },
    from: DocStatus,
    to: DocStatus,
    reopening: boolean,
  ) {
    if (!this.notifications) return;
    const organizationId = doc.event.organizationId ?? null;
    const entity = doc.event.entity as EntityKey;
    const linkUrl = `/events/${doc.eventId}?tab=checklists&checklist=${doc.id}`;
    const body = `${doc.title} · ${doc.event.name}`;
    const who = actor.fullName || 'Alguien del equipo';

    if (to === DocStatus.REVIEW) {
      const people = await this.prisma.user.findMany({
        where: { active: true, ...(organizationId ? { organizationId } : {}) },
        select: { id: true, roleKey: true, entities: true },
      });
      const approvers = people.filter((p) => {
        if (p.id === actor.id) return false;
        const role = p.roleKey as RoleKey;
        try {
          assertCanTransition(role, DocStatus.APPROVED);
        } catch {
          return false;
        }
        if (!canAccessEventOps(p.entities as EntityKey[], role, entity)) return false;
        if (role === 'gerente_arta' && entity !== 'ARTA') return false;
        if (role === 'dir_auditorio' && entity !== 'EXPLANADA') return false;
        return true;
      });
      await this.notifications.notifyMany(
        approvers.map((p) => ({
          userId: p.id,
          organizationId,
          actorId: actor.id,
          type: 'checklist.submitted',
          title: `${who} mandó un formato a revisión`,
          body,
          linkUrl,
          entity,
        })),
      );
      return;
    }

    const owner = doc.submittedById;
    if (!owner || owner === actor.id) return;
    const copy: Partial<Record<DocStatus, { type: string; title: string }>> = {
      APPROVED: { type: 'checklist.approved', title: `${who} aprobó tu formato` },
      SEALED: { type: 'checklist.sealed', title: `${who} selló tu formato` },
      DRAFT: reopening
        ? { type: 'checklist.reopened', title: `${who} reabrió un formato sellado` }
        : { type: 'checklist.returned', title: `${who} regresó tu formato a borrador` },
    };
    const msg = from === to ? undefined : copy[to];
    if (!msg) return;
    await this.notifications.notify({
      userId: owner,
      organizationId,
      actorId: actor.id,
      type: msg.type,
      title: msg.title,
      body,
      linkUrl,
      entity,
    });
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
    assertDocWritable(existing, existing.event);

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
    // Si la plantilla es de Excel, se copia el .xlsx al evento como EventFile editable.
    if ((template as any).excelTemplateUrl) {
      const srcUrl = (template as any).excelTemplateUrl as string;
      const rel = srcUrl.replace(/^\/uploads\//, '');
      const srcPath = `${uploadRoot}/${rel}`;
      if (!existsSync(srcPath)) throw new BadRequestException('La plantilla Excel ya no está en disco');
      const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const fileName = `${body.title || template.name}.xlsx`;
      const destUrl = `/uploads/${stamp}.xlsx`;
      writeFileSync(`${uploadRoot}/${stamp}.xlsx`, readFileSync(srcPath));
      const created = await this.prisma.eventFile.create({
        data: {
          eventId,
          fileName,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          url: destUrl,
          kind: 'excel',
          module: 'checklist',
          // creado por el sistema: editable por quien tenga permiso de checklist
          createdById: null,
          updatedById: req.user.id,
          sha256: createHash('sha256').update(readFileSync(`${uploadRoot}/${stamp}.xlsx`)).digest('hex'),
        },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'template.instantiate.excel',
          resource: 'EventFile',
          resourceId: created.id,
          metaJson: { eventId, templateId: template.id, fileName },
        },
      });
      return created;
    }

    // El encabezado del formato (show, fecha, hora, ciudad, venue) nace lleno
    // desde el evento: nadie debería teclear dos veces lo que ya se capturó.
    const dataJson = bindFormatToEvent(normalizeFormatData(template.schemaJson), event);

    const created = await this.prisma.checklistInstance.create({
      data: {
        eventId,
        templateId: template.id,
        title: body.title || template.name,
        dataJson: dataJson as unknown as Prisma.InputJsonValue,
        progressPct: calcProgress(dataJson),
        lastEditedById: req.user.id,
        lastEditedAt: new Date(),
      },
    });

    // Generar PDF base al crear desde plantilla
    return this.regeneratePdf(created.id);
  }

  /** Heurística simple: HTML de mammoth → secciones/ítems. */
  private docxHtmlToSchema(html: string): FormatData {
    const sections: FormatSection[] = [];
    let current: FormatSection | null = null;

    function ensureSection(title: string) {
      const id = title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const s: FormatSection = { id: id || `sec_${sections.length + 1}`, title: title || `Sección ${sections.length + 1}`, items: [] };
      sections.push(s);
      return s;
    }

    // 1) Secciones por encabezados H1/H2
    const headingRe = /<(h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    const blocks: Array<{ type: 'heading' | 'p' | 'ul' | 'table'; html: string }> = [];
    while ((m = headingRe.exec(html))) {
      const before = html.slice(lastIndex, m.index);
      if (before.trim()) blocks.push({ type: 'p', html: before });
      blocks.push({ type: 'heading', html: m[0] });
      lastIndex = headingRe.lastIndex;
    }
    const tail = html.slice(lastIndex);
    if (tail.trim()) blocks.push({ type: 'p', html: tail });

    // Partir listas y tablas dentro de los bloques <p> agregados
    const splitFurther: Array<{ type: 'p' | 'ul' | 'table'; html: string }> = [];
    for (const b of blocks) {
      if (b.type !== 'p') {
        splitFurther.push(b as any);
        continue;
      }
      const re = /<(ul|ol|table)[^>]*>[\s\S]*?<\/\1>/gi;
      let idx = 0;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(b.html))) {
        const before = b.html.slice(idx, mm.index);
        if (before.trim()) splitFurther.push({ type: 'p', html: before });
        splitFurther.push({ type: mm[1] as 'ul' | 'table', html: mm[0] });
        idx = re.lastIndex;
      }
      const rest = b.html.slice(idx);
      if (rest.trim()) splitFurther.push({ type: 'p', html: rest });
    }

    // Consumir en orden
    const textFrom = (frag: string) =>
      frag
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

    for (const b of splitFurther) {
      if (!current) current = ensureSection('Sección');
      if (b.type === 'ul') {
        const items = Array.from(b.html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((x) => textFrom(x[1] || ''));
        for (const label of items.filter(Boolean)) {
          const item: FormatItem = { id: this.slug(label, `item_${current.items.length + 1}`), label, type: 'check', done: false };
          current.items.push(item);
        }
        continue;
      }
      if (b.type === 'table') {
        const rows = Array.from(b.html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((x) => x[1] || '');
        const headers = rows[0]
          ? Array.from(rows[0].matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi)).map((x) => textFrom(x[2] || '')).filter(Boolean)
          : [];
        if (headers.length) {
          const cols = headers.map((h, i) => ({ id: this.slug(h, `col_${i + 1}`), label: h }));
          const item: FormatItem = {
            id: `tbl_${current.items.length + 1}`,
            label: headers.join(' / '),
            type: 'table',
            columns: cols,
            rows: [],
            minRows: 6,
          };
          current.items.push(item);
        }
        continue;
      }
      // Párrafos: cada «Etiqueta: valor» → campo texto con esa etiqueta
      const lines = textFrom(b.html)
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const line of lines) {
        const mcol = line.match(/^(.{3,80}?):\s*(.*)$/);
        const label = mcol ? mcol[1] : line;
        const item: FormatItem = { id: this.slug(label, `item_${current.items.length + 1}`), label, type: 'text', value: '' };
        current.items.push(item);
      }
    }

    return { sections };
  }

  private slug(label: string, fallback: string): string {
    const s = label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    return s || fallback;
  }
}
