import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EntityKey, Prisma } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';

class UpsertPageDto {
  @IsString()
  sectionKey!: string;

  @IsOptional() @IsString() title?: string;

  contentJson!: object;

  @IsOptional() @IsBoolean() published?: boolean;
}

class SlideDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsString() imageUrl!: string;
  @IsOptional() @IsString() ctaLabel?: string;
  @IsOptional() @IsString() ctaHref?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class NewsDto {
  @IsString() slug!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsBoolean() published?: boolean;
}

@Controller('studio')
export class StudioController {
  constructor(private prisma: PrismaService) {}

  private assertStudio(user: { roleKey: string; permissions: string[] }) {
    if (
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.STUDIO_EDIT) &&
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Sin permiso de Studio');
    }
  }

  /** Público — índice de noticias publicadas (sitemap) */
  @Get('public/news-index')
  async publicNewsIndex() {
    return this.prisma.newsPost.findMany({
      where: { entity: 'ARTA', published: true },
      select: { slug: true, publishedAt: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /** Público — noticia por slug (antes de public/:entity) */
  @Get('public/news/:slug')
  async publicNews(@Param('slug') slug: string) {
    const post = await this.prisma.newsPost.findFirst({
      where: { entity: 'ARTA', slug, published: true },
    });
    if (!post) throw new NotFoundException('Noticia no encontrada');
    return post;
  }

  /** Público — solo sitio Arta */
  @Get('public/:entity')
  async publicContent(@Param('entity') entity: string) {
    // Único sitio público: ARTA (ignora otros)
    const e: EntityKey = 'ARTA';
    void entity;
    const [pages, slides, news] = await Promise.all([
      this.prisma.pageContent.findMany({ where: { entity: e, published: true } }),
      this.prisma.heroSlide.findMany({
        where: { entity: e, active: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.newsPost.findMany({
        where: { entity: e, published: true },
        orderBy: { publishedAt: 'desc' },
        take: 12,
      }),
    ]);
    return { pages, slides, news };
  }

  @UseGuards(JwtAuthGuard)
  @Get('pages')
  async pages(@Req() req: { user: { roleKey: string; permissions: string[] } }) {
    this.assertStudio(req.user);
    return this.prisma.pageContent.findMany({
      where: { entity: 'ARTA' },
      orderBy: { sectionKey: 'asc' },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put('pages')
  async upsert(
    @Req() req: { user: { id: string; roleKey: string; permissions: string[] } },
    @Body() dto: UpsertPageDto,
  ) {
    this.assertStudio(req.user);
    const page = await this.prisma.pageContent.upsert({
      where: { entity_sectionKey: { entity: 'ARTA', sectionKey: dto.sectionKey } },
      create: {
        entity: 'ARTA',
        sectionKey: dto.sectionKey,
        title: dto.title,
        contentJson: dto.contentJson as Prisma.InputJsonValue,
        published: dto.published ?? false,
      },
      update: {
        title: dto.title,
        contentJson: dto.contentJson as Prisma.InputJsonValue,
        published: dto.published,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'studio.upsert',
        resource: 'PageContent',
        resourceId: page.id,
        metaJson: { sectionKey: dto.sectionKey },
      },
    });
    return page;
  }

  @UseGuards(JwtAuthGuard)
  @Get('slides')
  slides(@Req() req: { user: { roleKey: string; permissions: string[] } }) {
    this.assertStudio(req.user);
    return this.prisma.heroSlide.findMany({
      where: { entity: 'ARTA' },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('slides')
  createSlide(
    @Req() req: { user: { roleKey: string; permissions: string[] } },
    @Body() dto: SlideDto,
  ) {
    this.assertStudio(req.user);
    return this.prisma.heroSlide.create({
      data: {
        entity: 'ARTA',
        title: dto.title,
        subtitle: dto.subtitle,
        imageUrl: dto.imageUrl,
        ctaLabel: dto.ctaLabel,
        ctaHref: dto.ctaHref,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put('slides/:id')
  updateSlide(
    @Req() req: { user: { roleKey: string; permissions: string[] } },
    @Param('id') id: string,
    @Body() dto: SlideDto,
  ) {
    this.assertStudio(req.user);
    return this.prisma.heroSlide.update({
      where: { id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        imageUrl: dto.imageUrl,
        ctaLabel: dto.ctaLabel,
        ctaHref: dto.ctaHref,
        sortOrder: dto.sortOrder,
        active: dto.active,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('slides/:id')
  deleteSlide(
    @Req() req: { user: { roleKey: string; permissions: string[] } },
    @Param('id') id: string,
  ) {
    this.assertStudio(req.user);
    return this.prisma.heroSlide.delete({ where: { id } });
  }

  @UseGuards(JwtAuthGuard)
  @Get('news')
  newsList(
    @Req() req: { user: { roleKey: string; permissions: string[] } },
    @Query('all') all?: string,
  ) {
    this.assertStudio(req.user);
    return this.prisma.newsPost.findMany({
      where: { entity: 'ARTA', ...(all === '1' ? {} : {}) },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('news')
  createNews(
    @Req() req: { user: { roleKey: string; permissions: string[] } },
    @Body() dto: NewsDto,
  ) {
    this.assertStudio(req.user);
    return this.prisma.newsPost.create({
      data: {
        entity: 'ARTA',
        slug: dto.slug,
        title: dto.title,
        excerpt: dto.excerpt,
        body: dto.body,
        coverUrl: dto.coverUrl,
        published: dto.published ?? false,
        publishedAt: dto.published ? new Date() : null,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put('news/:id')
  updateNews(
    @Req() req: { user: { roleKey: string; permissions: string[] } },
    @Param('id') id: string,
    @Body() dto: NewsDto,
  ) {
    this.assertStudio(req.user);
    return this.prisma.newsPost.update({
      where: { id },
      data: {
        slug: dto.slug,
        title: dto.title,
        excerpt: dto.excerpt,
        body: dto.body,
        coverUrl: dto.coverUrl,
        published: dto.published,
        publishedAt: dto.published ? new Date() : null,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('news/:id')
  deleteNews(
    @Req() req: { user: { roleKey: string; permissions: string[] } },
    @Param('id') id: string,
  ) {
    this.assertStudio(req.user);
    return this.prisma.newsPost.delete({ where: { id } });
  }
}
