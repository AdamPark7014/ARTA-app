import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import { canAccessEventOps, eventOpsEntities, type EntityKey, type RoleKey } from '../common/rbac/roles';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  fullName: string;
  organizationId?: string | null;
};

class CreateTaskDto {
  /** Opcional: una tarea de apoyo entre compañeros no cuelga de ningún evento */
  @IsOptional() @IsString() eventId?: string;
  @IsString() title!: string;
  @IsOptional() @IsString() module?: string;
  @IsOptional() @IsString() detail?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() dueAt?: string;
}

const TASK_INCLUDE = {
  assignee: { select: { id: true, fullName: true, email: true } },
  createdBy: { select: { id: true, fullName: true } },
  event: { select: { id: true, name: true, entity: true, status: true } },
} satisfies Prisma.TaskAssignmentInclude;

function dueLabel(dueAt?: Date | null) {
  if (!dueAt) return '';
  return ` · vence ${dueAt.toLocaleDateString('es-MX')}`;
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async assertEvent(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(user, event.organizationId);
    return event;
  }

  private async assertEventOpen(user: AuthUser, eventId: string) {
    const event = await this.assertEvent(user, eventId);
    assertEventNotClosed(event.status);
    return event;
  }

  /**
   * Junta 2026-08-28: cualquier integrante puede pedir apoyo a otro. El
   * destinatario solo tiene que estar activo en la misma organización.
   */
  private async assertAssigneeInOrg(user: AuthUser, assigneeId?: string | null) {
    if (!assigneeId) return null;
    const assignee = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, fullName: true, active: true, organizationId: true },
    });
    if (!assignee || !assignee.active) throw new NotFoundException('Persona no encontrada');
    if (
      user.roleKey !== 'super_admin' &&
      (assignee.organizationId || tenantIdOf(user)) !== tenantIdOf(user)
    ) {
      throw new ForbiddenException('Esa persona no pertenece a tu organización');
    }
    return assignee;
  }

  /** Una tarea sin evento vive en el tenant; con evento, en el del evento. */
  private async assertCanTouch(
    user: AuthUser,
    task: { eventId: string | null; organizationId: string | null },
  ) {
    if (task.eventId) {
      await this.assertEvent(user, task.eventId);
      return;
    }
    assertSameTenant(user, task.organizationId);
  }

  @Get('event/:eventId')
  async byEvent(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    await this.assertEvent(req.user, eventId);
    return this.prisma.taskAssignment.findMany({
      where: { eventId },
      include: TASK_INCLUDE,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    });
  }

  /** Tareas asignadas a mí (de eventos que puedo ver, o sin evento). */
  @Get('mine')
  mine(@Req() req: { user: AuthUser }) {
    const allowed = eventOpsEntities(req.user.entities as EntityKey[], req.user.roleKey as RoleKey);
    const isSuper = req.user.roleKey === 'super_admin';
    const orgId = tenantIdOf(req.user);
    return this.prisma.taskAssignment.findMany({
      where: {
        assigneeId: req.user.id,
        OR: [
          { eventId: null, ...(isSuper ? {} : { organizationId: orgId }) },
          ...(allowed.length
            ? [
                {
                  event: {
                    entity: { in: allowed },
                    ...(isSuper ? {} : { organizationId: orgId }),
                  },
                },
              ]
            : []),
        ],
      },
      include: TASK_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  /** Tareas que yo pedí a otros — para dar seguimiento al apoyo solicitado. */
  @Get('requested')
  requested(@Req() req: { user: AuthUser }) {
    return this.prisma.taskAssignment.findMany({
      where: { createdById: req.user.id, NOT: { assigneeId: req.user.id } },
      include: TASK_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  /** Carga de todo el equipo (quién tiene qué). Solo gerencia. */
  @Get('workload')
  workload(@Req() req: { user: AuthUser }, @Query('status') status?: string) {
    const managers = ['super_admin', 'dir_general', 'gerente_arta', 'dir_auditorio'];
    if (!managers.includes(req.user.roleKey)) {
      throw new ForbiddenException('Vista de carga de equipo solo para gerencia');
    }
    const isSuper = req.user.roleKey === 'super_admin';
    const orgId = tenantIdOf(req.user);
    const allowed = eventOpsEntities(req.user.entities as EntityKey[], req.user.roleKey as RoleKey);
    return this.prisma.taskAssignment.findMany({
      where: {
        ...(status && status !== 'all' ? { status: status as TaskStatus } : {}),
        OR: [
          { eventId: null, ...(isSuper ? {} : { organizationId: orgId }) },
          ...(allowed.length
            ? [
                {
                  event: {
                    entity: { in: allowed },
                    ...(isSuper ? {} : { organizationId: orgId }),
                  },
                },
              ]
            : []),
        ],
      },
      include: TASK_INCLUDE,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: 300,
    });
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() dto: CreateTaskDto) {
    const event = dto.eventId ? await this.assertEventOpen(req.user, dto.eventId) : null;
    const assignee = await this.assertAssigneeInOrg(req.user, dto.assigneeId);

    const task = await this.prisma.taskAssignment.create({
      data: {
        eventId: dto.eventId || undefined,
        organizationId: event?.organizationId || tenantIdOf(req.user),
        title: dto.title,
        module: dto.module,
        detail: dto.detail,
        assigneeId: dto.assigneeId || undefined,
        createdById: req.user.id,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        status: 'OPEN',
      },
      include: TASK_INCLUDE,
    });

    if (assignee) {
      await this.notifications.notify({
        userId: assignee.id,
        organizationId: task.organizationId,
        actorId: req.user.id,
        type: 'task.assigned',
        title: `${req.user.fullName} te asignó una tarea`,
        body: `${task.title}${event ? ` · ${event.name}` : ''}${dueLabel(task.dueAt)}`,
        linkUrl: event ? `/events/${event.id}?tab=tasks` : '/tasks',
        entity: event?.entity,
      });
    }

    return task;
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      module?: string;
      detail?: string;
      assigneeId?: string | null;
      status?: TaskStatus;
      dueAt?: string | null;
    },
  ) {
    const task = await this.prisma.taskAssignment.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!task) throw new NotFoundException();
    await this.assertCanTouch(req.user, task);
    if (task.eventId && task.event) assertEventNotClosed(task.event.status);

    const reassigned =
      body.assigneeId !== undefined && (body.assigneeId || null) !== (task.assigneeId || null);
    if (reassigned && body.assigneeId) await this.assertAssigneeInOrg(req.user, body.assigneeId);

    const updated = await this.prisma.taskAssignment.update({
      where: { id },
      data: {
        title: body.title,
        module: body.module,
        detail: body.detail,
        assigneeId: body.assigneeId === null ? null : body.assigneeId,
        status: body.status,
        dueAt: body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : undefined,
      },
      include: TASK_INCLUDE,
    });

    const link = updated.eventId ? `/events/${updated.eventId}?tab=tasks` : '/tasks';
    const eventName = updated.event?.name;

    if (reassigned && updated.assigneeId) {
      await this.notifications.notify({
        userId: updated.assigneeId,
        organizationId: updated.organizationId,
        actorId: req.user.id,
        type: 'task.reassigned',
        title: `${req.user.fullName} te pasó una tarea`,
        body: `${updated.title}${eventName ? ` · ${eventName}` : ''}${dueLabel(updated.dueAt)}`,
        linkUrl: link,
        entity: updated.event?.entity,
      });
    }

    // Quien pidió el apoyo se entera de que ya está cerrado (o bloqueado).
    if (body.status && body.status !== task.status && updated.createdById) {
      const closed = body.status === 'DONE';
      const blocked = body.status === 'BLOCKED';
      if (closed || blocked) {
        await this.notifications.notify({
          userId: updated.createdById,
          organizationId: updated.organizationId,
          actorId: req.user.id,
          type: closed ? 'task.done' : 'task.blocked',
          title: closed
            ? `${req.user.fullName} completó una tarea que pediste`
            : `${req.user.fullName} bloqueó una tarea que pediste`,
          body: `${updated.title}${eventName ? ` · ${eventName}` : ''}`,
          linkUrl: link,
          entity: updated.event?.entity,
        });
      }
    }

    return updated;
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const task = await this.prisma.taskAssignment.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!task) throw new NotFoundException();
    await this.assertCanTouch(req.user, task);
    if (task.event) assertEventNotClosed(task.event.status);
    await this.prisma.taskAssignment.delete({ where: { id } });
    return { ok: true };
  }
}
