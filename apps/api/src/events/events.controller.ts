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
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignType, EntityKey, EventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  canAccessEventOps,
  eventOpsEntities,
  hasPermission,
  PERMISSIONS,
  type EntityKey as EK,
  type RoleKey,
} from '../common/rbac/roles';
import { ChecklistPdfService } from '../checklists/checklist-pdf.service';
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
}

class UpdateEventDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() artist?: string;
  @IsOptional() @IsString() promoter?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  /** Status solo vía POST close|cancel|reopen — no en PATCH (evita bypass EVENT_CLOSE). */
  @IsOptional() @IsEnum(CampaignType) campaignType?: CampaignType;
  @IsOptional() @IsString() notes?: string;
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
        _count: { select: { checklists: true, purchaseOrders: true, tasks: true } },
      },
    });
  }

  @Get(':id')
  async get(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        checklists: {
          include: {
            template: true,
            lastEditedBy: { select: { id: true, fullName: true } },
            deliveredBy: { select: { id: true, fullName: true } },
            authorizedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { updatedAt: 'desc' },
        },
        purchaseOrders: {
          orderBy: { updatedAt: 'desc' },
          include: { lines: true, proofs: true },
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
            activities: {
              include: { actor: { select: { id: true, fullName: true } } },
              orderBy: { createdAt: 'asc' },
              take: 80,
            },
          },
        },
        sponsors: { orderBy: { createdAt: 'desc' } },
        files: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!event) throw new BadRequestException('Evento no encontrado');
    assertSameTenant(req.user, event.organizationId);
    this.assertEntity(req.user, event.entity);
    return event;
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
      const instance = await this.prisma.checklistInstance.create({
        data: {
          eventId: event.id,
          templateId: t.id,
          title: t.name,
          dataJson: t.schemaJson as Prisma.InputJsonValue,
          progressPct: 0,
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
        data: t.schemaJson as never,
        delivered: null,
        authorized: null,
        editedBy: req.user.fullName || null,
        editedAt: new Date(),
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
    await this.prisma.financeRun.updateMany({ where: { eventId: id }, data: { locked: true } });
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
    if (req.user.roleKey !== 'dir_general' && req.user.roleKey !== 'super_admin') {
      throw new ForbiddenException('Solo dirección puede reabrir');
    }
    const event = await this.prisma.event.update({ where: { id }, data: { status: 'ACTIVE' } });
    await this.prisma.financeRun.updateMany({ where: { eventId: id }, data: { locked: false } });
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
    await this.prisma.financeRun.updateMany({ where: { eventId: id }, data: { locked: true } });
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
    if (req.user.roleKey !== 'dir_general' && req.user.roleKey !== 'super_admin') {
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
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
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
