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
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant } from '../common/tenant';
import { canAccessEventOps, type EntityKey, type RoleKey } from '../common/rbac/roles';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

class SponsorDto {
  @IsString() eventId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() contribution?: string;
  @IsOptional() amount?: number;
  @IsOptional() @IsString() notes?: string;
}

@Controller('sponsors')
@UseGuards(JwtAuthGuard)
export class SponsorsController {
  constructor(private prisma: PrismaService) {}

  @Get('event/:eventId')
  async list(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, event.organizationId);
    return this.prisma.sponsor.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() dto: SponsorDto) {
    const event = await this.prisma.event.findUnique({ where: { id: dto.eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, event.organizationId);
    return this.prisma.sponsor.create({
      data: {
        eventId: dto.eventId,
        name: dto.name,
        contact: dto.contact,
        contribution: dto.contribution,
        amount: dto.amount,
        notes: dto.notes,
        createdById: req.user.id,
      },
    });
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: Partial<SponsorDto>,
  ) {
    const existing = await this.prisma.sponsor.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new NotFoundException();
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        existing.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, existing.event.organizationId);
    return this.prisma.sponsor.update({
      where: { id },
      data: {
        name: body.name,
        contact: body.contact,
        contribution: body.contribution,
        amount: body.amount,
        notes: body.notes,
      },
    });
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const existing = await this.prisma.sponsor.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new NotFoundException();
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        existing.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, existing.event.organizationId);
    await this.prisma.sponsor.delete({ where: { id } });
    return { ok: true };
  }
}
