import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma, TaskStatus } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import { canAccessEventOps, eventOpsEntities, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { MULTER_OPTIONS, contentMatchesExtension, discardUpload } from '../uploads/upload-storage';
import {
  assertCanReview,
  assertCanSubmit,
  assertEvidencePresent,
  logTaskActivity,
  taskNeedsApproval,
} from './task-workflow';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  fullName: string;
  organizationId?: string | null;
};

class CreateTaskDto {
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
  approvedBy: { select: { id: true, fullName: true } },
  rejectedBy: { select: { id: true, fullName: true } },
  event: { select: { id: true, name: true, entity: true, status: true } },
  evidences: {
    include: { uploadedBy: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  activities: {
    include: { actor: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'asc' as const },
    take: 80,
  },
} satisfies Prisma.TaskAssignmentInclude;

function dueLabel(dueAt?: Date | null) {
  if (!dueAt) return '';
  return ` · vence ${dueAt.toLocaleDateString('es-MX')}`;
}

function taskLink(eventId?: string | null) {
  return eventId ? `/events/${eventId}?tab=tasks` : '/tasks';
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

  private async loadTask(id: string) {
    const task = await this.prisma.taskAssignment.findUnique({
      where: { id },
      include: { event: true, evidences: true },
    });
    if (!task) throw new NotFoundException();
    return task;
  }

  private async fetchTask(id: string) {
    return this.prisma.taskAssignment.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });
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

  @Get('mine')
  async mine(@Req() req: { user: AuthUser }) {
    const allowed = eventOpsEntities(req.user.entities as EntityKey[], req.user.roleKey as RoleKey);
    const isSuper = req.user.roleKey === 'super_admin';
    const orgId = tenantIdOf(req.user);
    const rows = await this.prisma.taskAssignment.findMany({
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

    const unseen = rows.filter((r) => !r.seenAt).map((r) => r.id);
    if (unseen.length) {
      const now = new Date();
      await this.prisma.taskAssignment.updateMany({
        where: { id: { in: unseen }, assigneeId: req.user.id },
        data: { seenAt: now },
      });
      return rows.map((r) => (r.seenAt ? r : { ...r, seenAt: now }));
    }
    return rows;
  }

  @Get('requested')
  requested(@Req() req: { user: AuthUser }) {
    return this.prisma.taskAssignment.findMany({
      where: { createdById: req.user.id, NOT: { assigneeId: req.user.id } },
      include: TASK_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  @Get('workload')
  workload(@Req() req: { user: AuthUser }, @Query('status') status?: string) {
    const managers = [
      'super_admin',
      'dir_general',
      'gerente_arta',
      'dir_auditorio',
      'convenios',
    ];
    if (!managers.includes(req.user.roleKey)) {
      throw new ForbiddenException('Vista de todas las tareas solo para dirección y convenios');
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

  @Get(':id')
  async one(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const task = await this.fetchTask(id);
    if (!task) throw new NotFoundException();
    await this.assertCanTouch(req.user, task);
    return task;
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() dto: CreateTaskDto) {
    // Junta 11-09-2026: «solo carpetas generales» consulta, no asigna trabajo.
    if (req.user.roleKey === 'solo_carpetas') {
      throw new ForbiddenException('Tu acceso es solo a carpetas generales');
    }
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

    await logTaskActivity(this.prisma, task.id, req.user.id, 'created', task.title, {
      assigneeId: task.assigneeId,
      eventId: task.eventId,
    });

    if (assignee) {
      await this.notifications.notify({
        userId: assignee.id,
        organizationId: task.organizationId,
        actorId: req.user.id,
        type: 'task.assigned',
        title: `${req.user.fullName} te asignó una tarea`,
        body: `${task.title}${event ? ` · ${event.name}` : ''}${dueLabel(task.dueAt)}`,
        linkUrl: taskLink(event?.id),
        entity: event?.entity,
      });
      await logTaskActivity(this.prisma, task.id, req.user.id, 'assigned', assignee.fullName);
    }

    return task;
  }

  @Post(':id/evidence')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async addEvidence(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { label?: string; note?: string },
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    if (!contentMatchesExtension(file.path, file.originalname)) {
      discardUpload(file.path);
      throw new BadRequestException('El contenido del archivo no corresponde a su extensión');
    }

    const task = await this.loadTask(id);
    await this.assertCanTouch(req.user, task);
    if (task.event) assertEventNotClosed(task.event.status);
    const isAssignee = task.assigneeId === req.user.id;
    const isRequester = task.createdById === req.user.id;
    if (!isAssignee && !isRequester && req.user.roleKey !== 'dir_general' && req.user.roleKey !== 'super_admin') {
      throw new ForbiddenException();
    }

    const fileUrl = `/uploads/${file.filename}`;
    const evidence = await this.prisma.taskEvidence.create({
      data: {
        taskId: id,
        fileUrl,
        label: body.label || file.originalname,
        note: body.note,
        uploadedById: req.user.id,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });

    await logTaskActivity(this.prisma, id, req.user.id, 'evidence_added', evidence.label || file.originalname, {
      fileUrl,
    });

    return evidence;
  }

  /** Entrega con evidencia — quien tiene la tarea la manda a revisión (o cierra si no hay quien apruebe). */
  @Post(':id/submit')
  async submit(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { completionNote?: string; fileUrls?: string[] },
  ) {
    const task = await this.loadTask(id);
    await this.assertCanTouch(req.user, task);
    if (task.event) assertEventNotClosed(task.event.status);
    assertCanSubmit(req.user.id, task);

    if (body.fileUrls?.length) {
      await this.prisma.taskEvidence.createMany({
        data: body.fileUrls.map((url) => ({
          taskId: id,
          fileUrl: url,
          uploadedById: req.user.id,
        })),
      });
    }

    const evidenceCount = await this.prisma.taskEvidence.count({ where: { taskId: id } });
    assertEvidencePresent(body.completionNote, body.fileUrls, evidenceCount);

    const now = new Date();
    const needsReview = taskNeedsApproval(task);
    const nextStatus: TaskStatus = needsReview ? 'PENDING_APPROVAL' : 'DONE';

    await this.prisma.taskAssignment.update({
      where: { id },
      data: {
        status: nextStatus,
        submittedAt: now,
        completionNote: body.completionNote?.trim() || null,
        rejectionNote: null,
        rejectedById: null,
        rejectedAt: null,
        ...(nextStatus === 'DONE'
          ? {
              approvedById: req.user.id,
              approvedAt: now,
            }
          : {
              approvedById: null,
              approvedAt: null,
            }),
      },
    });

    await logTaskActivity(
      this.prisma,
      id,
      req.user.id,
      needsReview ? 'submitted' : 'completed',
      body.completionNote?.trim(),
      { status: nextStatus, evidenceCount },
    );

    const updated = await this.fetchTask(id);
    const link = taskLink(updated?.eventId);
    const eventName = updated?.event?.name;

    if (needsReview && task.createdById) {
      await this.notifications.notify({
        userId: task.createdById,
        organizationId: task.organizationId,
        actorId: req.user.id,
        type: 'task.submitted',
        title: `${req.user.fullName} entregó una tarea para tu revisión`,
        body: `${task.title}${eventName ? ` · ${eventName}` : ''}`,
        linkUrl: link,
        entity: task.event?.entity,
      });
    } else if (task.createdById && task.createdById !== req.user.id) {
      await this.notifications.notify({
        userId: task.createdById,
        organizationId: task.organizationId,
        actorId: req.user.id,
        type: 'task.done',
        title: `${req.user.fullName} completó una tarea que pediste`,
        body: `${task.title}${eventName ? ` · ${eventName}` : ''}`,
        linkUrl: link,
        entity: task.event?.entity,
      });
    }

    return updated;
  }

  @Post(':id/approve')
  async approve(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const task = await this.loadTask(id);
    await this.assertCanTouch(req.user, task);
    assertCanReview(req.user.id, req.user.roleKey, task);
    if (task.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('La tarea no está pendiente de aprobación');
    }

    const now = new Date();
    await this.prisma.taskAssignment.update({
      where: { id },
      data: {
        status: 'DONE',
        approvedById: req.user.id,
        approvedAt: now,
        rejectionNote: null,
        rejectedById: null,
        rejectedAt: null,
      },
    });

    await logTaskActivity(this.prisma, id, req.user.id, 'approved', undefined, { status: 'DONE' });

    const updated = await this.fetchTask(id);
    if (task.assigneeId) {
      await this.notifications.notify({
        userId: task.assigneeId,
        organizationId: task.organizationId,
        actorId: req.user.id,
        type: 'task.approved',
        title: `${req.user.fullName} aprobó tu entrega`,
        body: task.title,
        linkUrl: taskLink(task.eventId),
        entity: task.event?.entity,
      });
    }

    return updated;
  }

  @Post(':id/reject')
  async reject(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { note: string },
  ) {
    const note = body.note?.trim();
    if (!note) throw new BadRequestException('Indica por qué rechazas la entrega');

    const task = await this.loadTask(id);
    await this.assertCanTouch(req.user, task);
    assertCanReview(req.user.id, req.user.roleKey, task);
    if (task.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('La tarea no está pendiente de aprobación');
    }

    const now = new Date();
    await this.prisma.taskAssignment.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        rejectedById: req.user.id,
        rejectedAt: now,
        rejectionNote: note,
        submittedAt: null,
        completionNote: null,
        approvedById: null,
        approvedAt: null,
        seenAt: null,
      },
    });

    await logTaskActivity(this.prisma, id, req.user.id, 'rejected', note, { status: 'IN_PROGRESS' });

    const updated = await this.fetchTask(id);
    if (task.assigneeId) {
      await this.notifications.notify({
        userId: task.assigneeId,
        organizationId: task.organizationId,
        actorId: req.user.id,
        type: 'task.rejected',
        title: `${req.user.fullName} pidió corrección en tu entrega`,
        body: `${task.title}: ${note}`,
        linkUrl: taskLink(task.eventId),
        entity: task.event?.entity,
      });
    }

    return updated;
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
    const task = await this.loadTask(id);
    await this.assertCanTouch(req.user, task);
    if (task.event) assertEventNotClosed(task.event.status);

    const reassigned =
      body.assigneeId !== undefined && (body.assigneeId || null) !== (task.assigneeId || null);
    if (reassigned && body.assigneeId) await this.assertAssigneeInOrg(req.user, body.assigneeId);

    if (body.status === 'DONE' && taskNeedsApproval(task) && task.assigneeId === req.user.id) {
      throw new BadRequestException(
        'Entrega la tarea con evidencia para que quien la pidió la apruebe',
      );
    }

    if (body.status === 'PENDING_APPROVAL') {
      throw new BadRequestException('Usa «Entregar tarea» con evidencia');
    }

    const reopening =
      body.status &&
      (body.status === 'OPEN' || body.status === 'IN_PROGRESS') &&
      (task.status === 'DONE' || task.status === 'PENDING_APPROVAL');

    const updated = await this.prisma.taskAssignment.update({
      where: { id },
      data: {
        title: body.title,
        module: body.module,
        detail: body.detail,
        assigneeId: body.assigneeId === null ? null : body.assigneeId,
        status: body.status,
        dueAt: body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : undefined,
        ...(reassigned ? { seenAt: null } : {}),
        ...(reopening
          ? {
              submittedAt: null,
              completionNote: null,
              approvedById: null,
              approvedAt: null,
              rejectedById: null,
              rejectedAt: null,
              rejectionNote: null,
            }
          : {}),
      },
      include: TASK_INCLUDE,
    });

    const link = taskLink(updated.eventId);
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
      await logTaskActivity(this.prisma, id, req.user.id, 'reassigned', updated.assignee?.fullName);
    }

    if (body.status && body.status !== task.status) {
      await logTaskActivity(this.prisma, id, req.user.id, 'status_changed', body.status, {
        from: task.status,
        to: body.status,
      });

      if (body.status === 'BLOCKED' && updated.createdById) {
        await this.notifications.notify({
          userId: updated.createdById,
          organizationId: updated.organizationId,
          actorId: req.user.id,
          type: 'task.blocked',
          title: `${req.user.fullName} bloqueó una tarea que pediste`,
          body: `${updated.title}${eventName ? ` · ${eventName}` : ''}`,
          linkUrl: link,
          entity: updated.event?.entity,
        });
      }

      if (body.status === 'DONE' && !taskNeedsApproval(task) && updated.createdById && updated.createdById !== req.user.id) {
        await this.notifications.notify({
          userId: updated.createdById,
          organizationId: updated.organizationId,
          actorId: req.user.id,
          type: 'task.done',
          title: `${req.user.fullName} completó una tarea que pediste`,
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
    const task = await this.loadTask(id);
    await this.assertCanTouch(req.user, task);
    if (task.event) assertEventNotClosed(task.event.status);
    await logTaskActivity(this.prisma, id, req.user.id, 'deleted', task.title);
    await this.prisma.taskAssignment.delete({ where: { id } });
    return { ok: true };
  }
}
