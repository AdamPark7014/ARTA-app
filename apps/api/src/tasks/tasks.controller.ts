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
import { IsArray, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService, type NotifyInput } from '../notifications/notifications.service';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import { canAccessEventOps, eventOpsEntities, isDirectionRole, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { MULTER_OPTIONS, contentMatchesExtension, discardUpload } from '../uploads/upload-storage';
import {
  assertCanReview,
  assertCanSubmit,
  assertEvidencePresent,
  isTaskAssignee,
  logTaskActivity,
  normalizeAssigneeIds,
  taskAssigneeIds,
  taskNeedsApproval,
  withAssignees,
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
  /** Una sola persona (forma de antes; la siguen usando scripts y pruebas). */
  @IsOptional() @IsString() assigneeId?: string;
  /** 1 o más personas, en orden: la primera queda como responsable principal. */
  @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
  @IsOptional() @IsString() dueAt?: string;
}

const TASK_INCLUDE = {
  assignee: { select: { id: true, fullName: true, email: true } },
  coAssignees: {
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
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

/** Forma del contrato móvil: la app abre la tarea nativa con estos enlaces. */
export function taskLink(eventId?: string | null, taskId?: string | null) {
  if (!taskId) return eventId ? `/events/${eventId}?tab=tasks` : '/tasks';
  return eventId ? `/events/${eventId}?tab=tasks&task=${taskId}` : `/tasks?task=${taskId}`;
}

const TASK_STATUS_LABEL: Partial<Record<TaskStatus, string>> = {
  OPEN: 'Pendiente',
  IN_PROGRESS: 'En curso',
  BLOCKED: 'Bloqueada',
  DONE: 'Terminada',
};

/** Lo que cambió de una tarea, en palabras: «fecha de entrega, título». */
function taskChanges(
  before: { title: string; dueAt: Date | null; detail: string | null },
  body: { title?: string; dueAt?: string | null; detail?: string },
) {
  const out: string[] = [];
  if (body.title !== undefined && body.title !== before.title) out.push('título');
  if (body.detail !== undefined && body.detail !== (before.detail ?? '')) out.push('detalle');
  if (body.dueAt !== undefined) {
    const next = body.dueAt ? new Date(body.dueAt).getTime() : null;
    if (next !== (before.dueAt?.getTime() ?? null)) out.push('fecha de entrega');
  }
  return out;
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

  /** Cada persona elegida, en el orden elegido, validada contra la organización. */
  private async assertAssigneesInOrg(user: AuthUser, ids: string[]) {
    const people = [];
    for (const id of ids) {
      const person = await this.assertAssigneeInOrg(user, id);
      if (person) people.push(person);
    }
    return people;
  }

  /**
   * Responsables que trae el cuerpo: `assigneeIds` (1 o más) o, en la forma de
   * antes, `assigneeId` (una o ninguna). `undefined` = no se tocan.
   */
  private requestedAssignees(body: { assigneeIds?: unknown; assigneeId?: string | null }): string[] | undefined {
    if (body.assigneeIds !== undefined) return normalizeAssigneeIds(body.assigneeIds);
    if (body.assigneeId !== undefined) return body.assigneeId ? [body.assigneeId] : [];
    return undefined;
  }

  private async notifyAssigned(
    actor: AuthUser,
    people: Array<{ id: string }>,
    task: { id: string; title: string; organizationId: string | null; dueAt: Date | null },
    event: { id: string; name: string; entity: NotifyInput['entity'] } | null | undefined,
    kind: 'task.assigned' | 'task.reassigned',
  ) {
    for (const person of people) {
      await this.notifications.notify({
        userId: person.id,
        organizationId: task.organizationId,
        actorId: actor.id,
        type: kind,
        title: kind === 'task.assigned' ? `${actor.fullName} te asignó una tarea` : `${actor.fullName} te pasó una tarea`,
        body: `${task.title}${event ? ` · ${event.name}` : ''}${dueLabel(task.dueAt)}`,
        linkUrl: taskLink(event?.id, task.id),
        entity: event?.entity,
      });
    }
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
      include: { event: true, evidences: true, coAssignees: { select: { userId: true } } },
    });
    if (!task) throw new NotFoundException();
    return task;
  }

  private async fetchTask(id: string) {
    const task = await this.prisma.taskAssignment.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });
    return task ? withAssignees(task) : null;
  }

  @Get('event/:eventId')
  async byEvent(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    await this.assertEvent(req.user, eventId);
    const rows = await this.prisma.taskAssignment.findMany({
      where: { eventId },
      include: TASK_INCLUDE,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    });
    return rows.map(withAssignees);
  }

  @Get('mine')
  async mine(@Req() req: { user: AuthUser }) {
    const allowed = eventOpsEntities(req.user.entities as EntityKey[], req.user.roleKey as RoleKey);
    const isSuper = req.user.roleKey === 'super_admin';
    const orgId = tenantIdOf(req.user);
    const rows = await this.prisma.taskAssignment.findMany({
      where: {
        // Mías = soy el responsable principal o uno de los corresponsables.
        AND: [{ OR: [{ assigneeId: req.user.id }, { coAssignees: { some: { userId: req.user.id } } }] }],
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

    // «Sin abrir» se apaga en cuanto cualquiera de sus responsables la ve.
    const unseen = rows.filter((r) => !r.seenAt).map((r) => r.id);
    if (unseen.length) {
      const now = new Date();
      await this.prisma.taskAssignment.updateMany({
        where: { id: { in: unseen } },
        data: { seenAt: now },
      });
      return rows.map((r) => withAssignees(r.seenAt ? r : { ...r, seenAt: now }));
    }
    return rows.map(withAssignees);
  }

  @Get('requested')
  async requested(@Req() req: { user: AuthUser }) {
    const rows = await this.prisma.taskAssignment.findMany({
      where: {
        createdById: req.user.id,
        // Si quien pidió también la tiene, es suya: va en «Mis tareas».
        NOT: { OR: [{ assigneeId: req.user.id }, { coAssignees: { some: { userId: req.user.id } } }] },
      },
      include: TASK_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map(withAssignees);
  }

  @Get('workload')
  async workload(@Req() req: { user: AuthUser }, @Query('status') status?: string) {
    const managers = [
      'super_admin',
      'dir_general',
      'dir_adjunta',
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
    const rows = await this.prisma.taskAssignment.findMany({
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
    return rows.map(withAssignees);
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
    // Correcciones 30-09-2026: una tarea puede ser de 1 o más personas.
    const people = await this.assertAssigneesInOrg(req.user, this.requestedAssignees(dto) ?? []);
    const [primary, ...others] = people;

    const created = await this.prisma.taskAssignment.create({
      data: {
        eventId: dto.eventId || undefined,
        organizationId: event?.organizationId || tenantIdOf(req.user),
        title: dto.title,
        module: dto.module,
        detail: dto.detail,
        assigneeId: primary?.id,
        coAssignees: others.length ? { create: others.map((p) => ({ userId: p.id })) } : undefined,
        createdById: req.user.id,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        status: 'OPEN',
      },
      include: TASK_INCLUDE,
    });
    const task = withAssignees(created);

    await logTaskActivity(this.prisma, task.id, req.user.id, 'created', task.title, {
      assigneeId: task.assigneeId,
      assigneeIds: task.assigneeIds,
      eventId: task.eventId,
    });

    if (people.length) {
      await this.notifyAssigned(req.user, people, task, event, 'task.assigned');
      await logTaskActivity(this.prisma, task.id, req.user.id, 'assigned', people.map((p) => p.fullName).join(', '));
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
    const isAssignee = isTaskAssignee(req.user.id, task);
    const isRequester = task.createdById === req.user.id;
    if (!isAssignee && !isRequester && !isDirectionRole(req.user.roleKey)) {
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

    // Quien pidió la tarea se entera del avance; si lo subió quien la pidió, lo ven sus responsables.
    const evidenceFor = isRequester ? taskAssigneeIds(task) : [task.createdById];
    void this.notifications.notifyUsers(evidenceFor, {
      organizationId: task.organizationId,
      actorId: req.user.id,
      type: 'task.evidence',
      title: `${req.user.fullName} subió evidencia a una tarea`,
      body: `${task.title} · ${evidence.label || file.originalname}`,
      linkUrl: taskLink(task.eventId, task.id),
      entity: task.event?.entity,
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
    const link = taskLink(updated?.eventId, id);
    const eventName = updated?.event?.name;

    if (needsReview) {
      // Si quien la pidió ya no está activo, la revisa dirección o la gerencia de la entidad.
      const requester = task.createdById
        ? await this.prisma.user.findUnique({ where: { id: task.createdById }, select: { active: true } })
        : null;
      const reviewers = requester?.active
        ? [task.createdById]
        : await this.notifications.whoCan({
            organizationId: task.organizationId,
            entity: task.event?.entity ?? null,
            directionOnly: true,
            exclude: req.user.id,
          });
      await this.notifications.notifyUsers(reviewers, {
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
    for (const userId of taskAssigneeIds(task)) {
      await this.notifications.notify({
        userId,
        organizationId: task.organizationId,
        actorId: req.user.id,
        type: 'task.approved',
        title: `${req.user.fullName} aprobó tu entrega`,
        body: task.title,
        linkUrl: taskLink(task.eventId, task.id),
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
    for (const userId of taskAssigneeIds(task)) {
      await this.notifications.notify({
        userId,
        organizationId: task.organizationId,
        actorId: req.user.id,
        type: 'task.rejected',
        title: `${req.user.fullName} pidió corrección en tu entrega`,
        body: `${task.title}: ${note}`,
        linkUrl: taskLink(task.eventId, task.id),
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
      /** Una persona (forma de antes; «Reasignar a…» en lote). Deja la tarea solo con ella. */
      assigneeId?: string | null;
      /** Lista completa de responsables, en orden; la primera es la principal. */
      assigneeIds?: string[];
      status?: TaskStatus;
      dueAt?: string | null;
    },
  ) {
    const task = await this.loadTask(id);
    await this.assertCanTouch(req.user, task);
    if (task.event) assertEventNotClosed(task.event.status);

    const before = taskAssigneeIds(task);
    const wanted = this.requestedAssignees(body);
    const reassigned = wanted !== undefined && wanted.join('|') !== before.join('|');
    const people = reassigned ? await this.assertAssigneesInOrg(req.user, wanted!) : [];
    const added = people.filter((p) => !before.includes(p.id));

    if (body.status === 'DONE' && taskNeedsApproval(task) && isTaskAssignee(req.user.id, task)) {
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

    const saved = await this.prisma.taskAssignment.update({
      where: { id },
      data: {
        title: body.title,
        module: body.module,
        detail: body.detail,
        ...(reassigned
          ? {
              assigneeId: people[0]?.id ?? null,
              coAssignees: {
                deleteMany: {},
                create: people.slice(1).map((p) => ({ userId: p.id })),
              },
            }
          : {}),
        status: body.status,
        dueAt: body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : undefined,
        // Alguien nuevo en la tarea todavía no la ha abierto.
        ...(added.length ? { seenAt: null } : {}),
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
    const updated = withAssignees(saved);

    const link = taskLink(updated.eventId, id);
    const eventName = updated.event?.name;
    const where = `${updated.title}${eventName ? ` · ${eventName}` : ''}`;
    const base = {
      organizationId: updated.organizationId,
      actorId: req.user.id,
      linkUrl: link,
      entity: updated.event?.entity,
    };
    const addedIds = new Set(added.map((p) => p.id));
    const stayed = updated.assigneeIds.filter((uid) => !addedIds.has(uid));

    if (reassigned) {
      // Solo avisa a quien se suma: los que ya la tenían no necesitan otro aviso.
      await this.notifyAssigned(req.user, added, updated, updated.event, 'task.reassigned');
      const removed = before.filter((uid) => !updated.assigneeIds.includes(uid));
      await this.notifications.notifyUsers(removed, {
        ...base,
        linkUrl: '/tasks',
        type: 'task.unassigned',
        title: `${req.user.fullName} te quitó de una tarea`,
        body: where,
      });
    }

    if (reopening) {
      await this.notifications.notifyUsers(stayed, {
        ...base,
        type: 'task.reopened',
        title: `${req.user.fullName} reabrió una tarea`,
        body: where,
      });
    } else {
      const changes = taskChanges(task, body);
      if (changes.length) {
        const dueOnly = changes.length === 1 && changes[0] === 'fecha de entrega';
        await this.notifications.notifyUsers(stayed, {
          ...base,
          type: dueOnly ? 'task.due_changed' : 'task.updated',
          title: dueOnly
            ? `${req.user.fullName} cambió la fecha de una tarea`
            : `${req.user.fullName} actualizó una tarea`,
          body: dueOnly ? `${where}${dueLabel(updated.dueAt) || ' · sin fecha'}` : `${where} · ${changes.join(', ')}`,
        });
      }
    }

    if (reassigned) {
      await logTaskActivity(
        this.prisma,
        id,
        req.user.id,
        'reassigned',
        updated.assignees.map((p) => p.fullName).join(', ') || 'Sin asignar',
        { from: before, to: updated.assigneeIds },
      );
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

      // Si lo movió alguien que no la tiene (quien la pidió, dirección), sus responsables se enteran.
      if (!reopening && !isTaskAssignee(req.user.id, task)) {
        await this.notifications.notifyUsers(stayed, {
          ...base,
          type: 'task.status_changed',
          title: `${req.user.fullName} cambió el estado de una tarea`,
          body: `${where} · ${TASK_STATUS_LABEL[body.status] ?? body.status}`,
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
    await this.notifications.notifyUsers([...taskAssigneeIds(task), task.createdById], {
      organizationId: task.organizationId,
      actorId: req.user.id,
      type: 'task.deleted',
      title: `${req.user.fullName} eliminó una tarea`,
      body: `${task.title}${task.event ? ` · ${task.event.name}` : ''}`,
      linkUrl: taskLink(task.eventId),
      entity: task.event?.entity,
    });
    return { ok: true };
  }
}
