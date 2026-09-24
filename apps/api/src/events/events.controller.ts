import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CampaignType, EntityKey, EventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  canAccessEventOps,
  eventOpsEntities,
  hasPermission,
  isDirectionRole,
  PERMISSIONS,
  type EntityKey as EK,
  type RoleKey,
} from '../common/rbac/roles';
import { ChecklistPdfService } from '../checklists/checklist-pdf.service';
import { VISIBLE_CHECKLIST_WHERE } from '../checklists/checklist-visibility';
import { calcProgress } from '../common/checklist-progress';
import { bindFormatToEvent, normalizeFormatData } from '../common/format-schema';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertEventSlotAvailable } from '../common/plan-limits';

class CreateEventDto {
  @IsEnum(EntityKey)
  entity!: EntityKey;

  @IsString()
  name!: string;

  @IsOptional() @IsString() artist?: string;
  @IsOptional() @IsString() promoter?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsEnum(CampaignType) campaignType?: CampaignType;
  @IsOptional() @IsString() notes?: string;
  /** Junta 11-09-2026: descripción, horario y funciones al crear el evento. */
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() schedule?: string;
  @IsOptional() @IsInt() @Min(1) functions?: number;
}

class UpdateEventDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() artist?: string;
  @IsOptional() @IsString() promoter?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() startsAt?: string;
  /** `null` explícito = quitar la fecha de fin. `@IsOptional()` deja pasar el null. */
  @IsOptional() @IsString() endsAt?: string | null;
  /** Status solo vía POST close|cancel|reopen — no en PATCH (evita bypass EVENT_CLOSE). */
  @IsOptional() @IsEnum(CampaignType) campaignType?: CampaignType;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() schedule?: string;
  /** `null` explícito = quitar el número de funciones. */
  @IsOptional() @IsInt() @Min(1) functions?: number | null;
}

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  fullName?: string;
  organizationId?: string | null;
};

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(
    private prisma: PrismaService,
    private pdfs: ChecklistPdfService,
  ) {}

  private assertEntity(user: AuthUser, entity: EntityKey) {
    if (!canAccessEventOps(user.entities as EK[], user.roleKey as RoleKey, entity as EK)) {
      throw new ForbiddenException(
        entity === 'ARTA' && user.roleKey === 'dir_auditorio'
          ? 'En Arta solo tienes carpetas generales (no eventos)'
          : `Sin acceso a ${entity}`,
      );
    }
  }

  private assertNotClosed(status: EventStatus) {
    if (status === 'CLOSED' || status === 'CANCELLED') {
      throw new ForbiddenException('Evento cerrado / cancelado — solo lectura');
    }
  }

  @Get()
  async list(
    @Req() req: { user: AuthUser },
    @Query('entity') entity?: EntityKey,
    @Query('scope') scope?: 'active' | 'past' | 'all',
  ) {
    const allowed = eventOpsEntities(req.user.entities as EntityKey[], req.user.roleKey as RoleKey);
    if (!allowed.length) return [];
    const orgId = tenantIdOf(req.user);
    const where: Prisma.EventWhereInput =
      entity && allowed.includes(entity)
        ? { entity, organizationId: orgId }
        : { entity: { in: allowed }, organizationId: orgId };

    if (scope === 'past' || scope === 'active') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const pastOr: Prisma.EventWhereInput[] = [
        { status: { in: ['CLOSED', 'CANCELLED'] } },
        { startsAt: { lt: startOfToday } },
      ];
      if (scope === 'past') {
        where.OR = pastOr;
      } else {
        where.NOT = { OR: pastOr };
      }
    }

    return this.prisma.event.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      // Safety cap — an org running events for years has no other bound here.
      // Real UI usage never approaches this; it just stops an unbounded scan.
      take: 500,
      include: {
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { checklists: { where: VISIBLE_CHECKLIST_WHERE }, purchaseOrders: true, tasks: true } },
      },
    });
  }

  @Get(':id')
  async get(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        /**
         * La LISTA de formatos, no su contenido.
         *
         * Esto venía con `include: { template: true }` y todos los campos de
         * la instancia, así que cada carga del evento se traía, por cada
         * formato: el `dataJson` completo, el `schemaJson` entero de la
         * plantilla, el mapa de campos del PDF y **las dos firmas, que llevan
         * la imagen en base64 dentro**. Nada de eso lo pinta la lista: cuando
         * se abre un formato, el panel ya pide `GET /checklists/:id` aparte.
         *
         * Sobre la base sembrada eran 32 de 45 KB — el 72 % — y el panel
         * recarga el evento entero después de *cada* guardado (27 sitios),
         * así que el desperdicio se multiplica por cada casilla que alguien
         * marca. En un show real con formatos llenos y firmados es peor: una
         * firma es un PNG en base64.
         */
        checklists: {
          // Los formatos vacíos de plantillas retiradas no se listan.
          where: VISIBLE_CHECKLIST_WHERE,
          select: {
            id: true,
            eventId: true,
            templateId: true,
            title: true,
            progressPct: true,
            status: true,
            revision: true,
            pdfUrl: true,
            pdfGeneratedAt: true,
            lastEditedAt: true,
            submittedAt: true,
            approvedAt: true,
            sealedAt: true,
            deliveredAt: true,
            authorizedAt: true,
            reopenReason: true,
            createdAt: true,
            updatedAt: true,
            template: { select: { key: true, name: true } },
            lastEditedBy: { select: { id: true, fullName: true } },
            deliveredBy: { select: { id: true, fullName: true } },
            authorizedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { updatedAt: 'desc' },
        },
        purchaseOrders: {
          orderBy: { updatedAt: 'desc' },
          // El machote de la OC lleva solicitante y quién autorizó.
          include: {
            lines: true,
            proofs: true,
            createdBy: { select: { fullName: true } },
            authorizedBy: { select: { fullName: true } },
          },
        },
        financeRuns: true,
        campaign: true,
        ticketingSetups: true,
        tasks: {
          include: {
            assignee: { select: { id: true, fullName: true } },
            createdBy: { select: { id: true, fullName: true } },
            approvedBy: { select: { id: true, fullName: true } },
            rejectedBy: { select: { id: true, fullName: true } },
            evidences: {
              include: { uploadedBy: { select: { id: true, fullName: true } } },
              orderBy: { createdAt: 'asc' },
            },
            /**
             * El historial arranca colapsado en el panel («Ver historial · N
             * movimientos»), así que traer 80 movimientos por tarea era pagar
             * por algo que nadie mira. Se traen los últimos 12 —suficiente
             * para el resumen y para el caso normal— y se ordenan al pintar.
             */
            activities: {
              include: { actor: { select: { id: true, fullName: true } } },
              orderBy: { createdAt: 'desc' },
              take: 12,
            },
          },
        },
        sponsors: { orderBy: { createdAt: 'desc' } },
        // Los borrados quedan en la base para poder deshacerlos, pero no se listan.
        files: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!event) throw new BadRequestException('Evento no encontrado');
    assertSameTenant(req.user, event.organizationId);
    this.assertEntity(req.user, event.entity);
    // Se pidieron los ÚLTIMOS 12 movimientos (`desc`), pero el panel los pinta
    // en orden de sucesión: se devuelven ascendentes, como el resto del API.
    return {
      ...event,
      tasks: event.tasks.map((t) => ({ ...t, activities: [...t.activities].reverse() })),
    };
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() dto: CreateEventDto) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVENT_CREATE)) {
      throw new ForbiddenException('Sin permiso para crear eventos');
    }
    this.assertEntity(req.user, dto.entity);
    const organizationId = tenantIdOf(req.user);
    await assertEventSlotAvailable(this.prisma, organizationId);
    const event = await this.prisma.event.create({
      data: {
        organizationId,
        entity: dto.entity,
        name: dto.name,
        artist: dto.artist,
        promoter: dto.promoter,
        venue: dto.venue,
        city: dto.city,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        campaignType: dto.campaignType ?? 'NONE',
        notes: dto.notes,
        description: dto.description?.trim() || undefined,
        schedule: dto.schedule?.trim() || undefined,
        functions: dto.functions ?? undefined,
        status: 'ACTIVE',
        createdById: req.user.id,
      },
    });

    const templates = await this.prisma.checklistTemplate.findMany({
      where: {
        active: true,
        OR: [{ entities: { isEmpty: true } }, { entities: { has: dto.entity } }],
      },
    });

    for (const t of templates) {
      // Encabezado del formato lleno desde el evento (show, fecha, hora,
      // ciudad, venue): lo capturado en el alta no se vuelve a teclear.
      const dataJson = bindFormatToEvent(normalizeFormatData(t.schemaJson), event);
      const instance = await this.prisma.checklistInstance.create({
        data: {
          eventId: event.id,
          templateId: t.id,
          title: t.name,
          dataJson: dataJson as unknown as Prisma.InputJsonValue,
          progressPct: calcProgress(dataJson),
          lastEditedById: req.user.id,
          lastEditedAt: new Date(),
        },
      });

      // PDF base editable/descargable desde el momento de crear el check
      const { url, fieldMap } = await this.pdfs.generate(instance.id, {
        title: t.name,
        eventName: event.name,
        entity: event.entity,
        artist: event.artist,
        venue: event.venue,
        city: event.city,
        templateKey: t.key,
        data: dataJson,
        delivered: null,
        authorized: null,
        editedBy: req.user.fullName || null,
        editedAt: new Date(),
        statusLabel: 'Borrador',
      });
      await this.prisma.checklistInstance.update({
        where: { id: instance.id },
        data: {
          pdfUrl: url,
          pdfGeneratedAt: new Date(),
          pdfFieldsJson: fieldMap as unknown as Prisma.InputJsonValue,
        },
      });
      await this.prisma.eventFile.create({
        data: {
          eventId: event.id,
          checklistId: instance.id,
          fileName: `${t.name}.pdf`,
          mimeType: 'application/pdf',
          url,
          kind: 'pdf',
          module: 'checklist',
        },
      });
    }

    if (dto.campaignType && dto.campaignType !== 'NONE') {
      await this.prisma.campaign.create({
        data: { eventId: event.id, type: dto.campaignType },
      });
    }

    await this.prisma.financeRun.create({
      data: {
        eventId: event.id,
        title: 'Corrida financiera',
        dataJson: {
          rows: [],
          totalIncome: 0,
          totalExpense: 0,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'event.create',
        resource: 'Event',
        resourceId: event.id,
        metaJson: { name: event.name, entity: event.entity, checklists: templates.length },
      },
    });

    return this.get(req, event.id);
  }

  @Post(':id/close')
  async close(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Evento no encontrado');
    assertSameTenant(req.user, existing.organizationId);
    this.assertEntity(req.user, existing.entity);
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVENT_CLOSE)) {
      throw new ForbiddenException('Sin permiso para cerrar evento');
    }
    const event = await this.prisma.event.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
    /*
     * Cerrar el evento NO sella la corrida.
     *
     * Cerrar es operativo; sellar es un acto de responsabilidad con firmante y
     * fecha. Confundirlos implicaba que reabrir DES-sellara — y así era: el
     * `reopen` ponía `locked: false` en todas las corridas del evento, echando
     * abajo un sello que alguien había puesto a conciencia. El evento cerrado
     * ya deja todo en solo lectura a través de `docWriteBlock`.
     */
    await this.prisma.auditLog.create({
      data: { userId: req.user.id, action: 'event.close', resource: 'Event', resourceId: id },
    });
    return event;
  }

  @Post(':id/reopen')
  async reopen(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Evento no encontrado');
    assertSameTenant(req.user, existing.organizationId);
    this.assertEntity(req.user, existing.entity);
    if (!isDirectionRole(req.user.roleKey)) {
      throw new ForbiddenException('Solo dirección puede reabrir');
    }
    const event = await this.prisma.event.update({ where: { id }, data: { status: 'ACTIVE' } });
    // Reabrir el evento devuelve cada documento a SU propio estado; jamás
    // degrada un sellado. Para eso está `POST /finance/:id/unlock`, con motivo.

    await this.prisma.auditLog.create({
      data: { userId: req.user.id, action: 'event.reopen', resource: 'Event', resourceId: id },
    });
    return event;
  }

  @Post(':id/cancel')
  async cancel(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Evento no encontrado');
    assertSameTenant(req.user, existing.organizationId);
    this.assertEntity(req.user, existing.entity);
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVENT_CLOSE)) {
      throw new ForbiddenException();
    }
    const event = await this.prisma.event.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    // Igual que al cerrar: cancelar no sella, el oráculo ya bloquea.
    await this.prisma.auditLog.create({
      data: { userId: req.user.id, action: 'event.cancel', resource: 'Event', resourceId: id },
    });
    return event;
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Evento no encontrado');
    assertSameTenant(req.user, existing.organizationId);
    this.assertEntity(req.user, existing.entity);
    if (!isDirectionRole(req.user.roleKey)) {
      throw new ForbiddenException('Solo dirección puede eliminar eventos');
    }
    await this.prisma.event.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: { userId: req.user.id, action: 'event.delete', resource: 'Event', resourceId: id },
    });
    return { ok: true };
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Evento no encontrado');
    assertSameTenant(req.user, existing.organizationId);
    this.assertEntity(req.user, existing.entity);
    this.assertNotClosed(existing.status);

    const event = await this.prisma.event.update({
      where: { id },
      data: {
        name: dto.name,
        artist: dto.artist,
        promoter: dto.promoter,
        venue: dto.venue,
        city: dto.city,
        campaignType: dto.campaignType,
        notes: dto.notes,
        description: dto.description,
        schedule: dto.schedule,
        functions: dto.functions === undefined ? undefined : dto.functions,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        // Distinguir «no lo mandes» de «bórralo»: sin esto, una fecha de fin
        // puesta por error no se podía quitar nunca.
        endsAt:
          dto.endsAt === undefined ? undefined : dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'event.update',
        resource: 'Event',
        resourceId: id,
        metaJson: dto as object,
      },
    });

    return event;
  }
}
