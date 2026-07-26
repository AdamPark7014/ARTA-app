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
  Req,
  UseGuards,
} from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { canAccessEventOps, eventOpsEntities, type EntityKey, type RoleKey } from '../common/rbac/roles';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  fullName: string;
  organizationId?: string | null;
};

class CreateTaskDto {
  @IsString() eventId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() module?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() dueAt?: string;
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private prisma: PrismaService) {}

  private async assertEvent(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(user, event.organizationId);
    return event;
  }

  @Get('event/:eventId')
  async byEvent(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    await this.assertEvent(req.user, eventId);
    return this.prisma.taskAssignment.findMany({
      where: { eventId },
      include: { assignee: { select: { id: true, fullName: true, email: true } } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    });
  }

  @Get('mine')
  mine(@Req() req: { user: AuthUser }) {
    const allowed = eventOpsEntities(req.user.entities as EntityKey[], req.user.roleKey as RoleKey);
    if (!allowed.length) return [];
    const isSuper = req.user.roleKey === 'super_admin';
    return this.prisma.taskAssignment.findMany({
      where: {
        assigneeId: req.user.id,
        event: {
          entity: { in: allowed },
          ...(isSuper ? {} : { organizationId: tenantIdOf(req.user) }),
        },
      },
      include: {
        event: { select: { id: true, name: true, entity: true, status: true } },
        assignee: { select: { id: true, fullName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() dto: CreateTaskDto) {
    await this.assertEvent(req.user, dto.eventId);
    return this.prisma.taskAssignment.create({
      data: {
        eventId: dto.eventId,
        title: dto.title,
        module: dto.module,
        assigneeId: dto.assigneeId || undefined,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        status: 'OPEN',
      },
      include: { assignee: { select: { id: true, fullName: true } } },
    });
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      module?: string;
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
    await this.assertEvent(req.user, task.eventId);
    return this.prisma.taskAssignment.update({
      where: { id },
      data: {
        title: body.title,
        module: body.module,
        assigneeId: body.assigneeId === null ? null : body.assigneeId,
        status: body.status,
        dueAt: body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : undefined,
      },
      include: { assignee: { select: { id: true, fullName: true } } },
    });
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const task = await this.prisma.taskAssignment.findUnique({ where: { id } });
    if (!task) throw new NotFoundException();
    await this.assertEvent(req.user, task.eventId);
    await this.prisma.taskAssignment.delete({ where: { id } });
    return { ok: true };
  }
}
