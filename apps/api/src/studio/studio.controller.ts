import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Optional,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EntityKey, Prisma } from '@prisma/client';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { canPublishStudio, hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';
import { assertSharedCatalogWrite, tenantIdOf } from '../common/tenant';

type StudioUser = {
  id?: string;
  roleKey: string;
  permissions: string[];
  organizationId?: string | null;
  fullName?: string | null;
};

/**
 * Plantillas de publicación (junta 23-10-2026, «plantilla de página web» para los practicantes de
 * Montse). Cada noticia es una página propia del sitio (`/p/arta/noticias/:slug`); la plantilla dice
 * qué campos lleva:
 *   - `publicacion` — Publicación / noticia: portada, título, entrada, texto y botón opcional.
 *   - `evento`      — Evento destacado: lo mismo más la fecha del show y el botón (boletos).
 */
export const NEWS_TEMPLATES = ['publicacion', 'evento'] as const;
export type NewsTemplate = (typeof NEWS_TEMPLATES)[number];

/**
 * Propuesta de cambio a una sección del inicio. El practicante no toca la sección publicada: guarda
 * su versión en una fila aparte (`home_hero__propuesta`, nunca publicada, así que el sitio público
 * no la ve) y dirección la revisa, la aplica y publica.
 */
export const PROPOSAL_SUFFIX = '__propuesta';

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
  /** Plantilla con la que se llenó (`publicacion` | `evento`); vacío = libre. */
  @IsOptional() @IsString() template?: string | null;
  /** Fecha del show (AAAA-MM-DD o ISO) — la pide la plantilla «Evento destacado». */
  @IsOptional() @IsString() eventDate?: string | null;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string | null;
  @IsOptional() @IsString() @MaxLength(500) ctaHref?: string | null;
}

class ReviewDto {
  @IsIn(['news', 'slide', 'section']) kind!: 'news' | 'slide' | 'section';
  @IsString() id!: string;
}

/** Enlaces que puede llevar el botón de una publicación: web, ruta del sitio, ancla, correo o teléfono. */
export function isSafeCtaHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return !/\s/.test(value);
  return /^[/#]/.test(value) && !value.startsWith('//');
}

function cleanOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const v = (value ?? '').trim();
  return v ? v : null;
}

/** Campos de la plantilla, validados. `undefined` = no se tocan (p. ej. publicar desde la lista). */
export function newsTemplateFields(dto: Partial<NewsDto>) {
  const template = cleanOptional(dto.template);
  if (template && !(NEWS_TEMPLATES as readonly string[]).includes(template)) {
    throw new BadRequestException('Plantilla inválida: usa «publicacion» o «evento»');
  }
  let eventDate: Date | null | undefined;
  const rawDate = cleanOptional(dto.eventDate);
  if (rawDate === undefined) eventDate = undefined;
  else if (rawDate === null) eventDate = null;
  else {
    // AAAA-MM-DD se guarda a mediodía UTC para que ningún huso lo corra al día anterior.
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? `${rawDate}T12:00:00.000Z` : rawDate);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Fecha del evento inválida (AAAA-MM-DD)');
    eventDate = parsed;
  }
  const ctaLabel = cleanOptional(dto.ctaLabel);
  const ctaHref = cleanOptional(dto.ctaHref);
  if (ctaHref && !isSafeCtaHref(ctaHref)) {
    throw new BadRequestException('El enlace del botón debe empezar con https://, /, #, mailto: o tel:');
  }
  return {
    template: template as NewsTemplate | null | undefined,
    eventDate,
    ctaLabel,
    ctaHref,
  };
}

@Controller('studio')
export class StudioController {
  constructor(
    private prisma: PrismaService,
    @Optional() private notifications?: NotificationsService,
  ) {}

  private assertStudio(user: { roleKey: string; permissions: string[] }) {
    if (
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.STUDIO_EDIT) &&
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Sin permiso de Studio');
    }
  }

  /** El sitio público es uno solo (sin organizationId): solo Arta o super_admin lo modifican. */
  private assertStudioWrite(user: StudioUser) {
    this.assertStudio(user);
    assertSharedCatalogWrite(user);
  }

  /** ¿Puede dejar algo publicado en el sitio? (el practicante solo deja borradores). */
  private canPublish(user: StudioUser) {
    return canPublishStudio(user.roleKey as RoleKey, user.permissions || []);
  }

  private assertPublish(user: StudioUser, message: string) {
    if (!this.canPublish(user)) throw new ForbiddenException(message);
  }

  /** Público — índice de noticias publicadas (sitemap) */
  @Get('public/news-index')
  async publicNewsIndex() {
    return this.prisma.newsPost.findMany({
      where: { entity: 'ARTA', published: true },
      select: { slug: true, publishedAt: true, updatedAt: true, coverUrl: true, title: true, excerpt: true },
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

  /**
   * Guardar una sección del inicio. Quien publica escribe la sección (y, si había una propuesta de
   * practicante, la da por revisada y la borra). El practicante escribe solo su propuesta.
   */
  @UseGuards(JwtAuthGuard)
  @Put('pages')
  async upsert(
    @Req() req: { user: StudioUser },
    @Body() dto: UpsertPageDto,
  ) {
    this.assertStudioWrite(req.user);
    const baseKey = String(dto.sectionKey || '').trim();
    if (!baseKey || baseKey.endsWith(PROPOSAL_SUFFIX)) {
      throw new BadRequestException('Sección inválida');
    }
    const publisher = this.canPublish(req.user);
    if (!publisher && dto.published) {
      throw new ForbiddenException('Tu cambio queda como propuesta: dirección la revisa y la publica');
    }
    const sectionKey = publisher ? baseKey : `${baseKey}${PROPOSAL_SUFFIX}`;
    const page = await this.prisma.pageContent.upsert({
      where: { entity_sectionKey: { entity: 'ARTA', sectionKey } },
      create: {
        entity: 'ARTA',
        sectionKey,
        title: dto.title,
        contentJson: dto.contentJson as Prisma.InputJsonValue,
        published: publisher ? (dto.published ?? false) : false,
      },
      update: {
        title: dto.title,
        contentJson: dto.contentJson as Prisma.InputJsonValue,
        published: publisher ? dto.published : false,
      },
    });
    if (publisher) {
      await this.prisma.pageContent.deleteMany({
        where: { entity: 'ARTA', sectionKey: `${baseKey}${PROPOSAL_SUFFIX}` },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: publisher ? 'studio.upsert' : 'studio.proposal',
        resource: 'PageContent',
        resourceId: page.id,
        metaJson: { sectionKey },
      },
    });
    return { ...page, proposal: !publisher };
  }

  /** Descartar la propuesta de un practicante sobre una sección (dirección). */
  @UseGuards(JwtAuthGuard)
  @Delete('pages/:sectionKey/proposal')
  async discardProposal(@Req() req: { user: StudioUser }, @Param('sectionKey') sectionKey: string) {
    this.assertStudioWrite(req.user);
    this.assertPublish(req.user, 'Solo quien publica descarta propuestas');
    const { count } = await this.prisma.pageContent.deleteMany({
      where: { entity: 'ARTA', sectionKey: `${sectionKey}${PROPOSAL_SUFFIX}` },
    });
    return { ok: true, deleted: count };
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
  async createSlide(
    @Req() req: { user: StudioUser },
    @Body() dto: SlideDto,
  ) {
    this.assertStudioWrite(req.user);
    const publisher = this.canPublish(req.user);
    if (!publisher && dto.active === true) {
      throw new ForbiddenException('El slide queda como borrador: dirección lo activa');
    }
    return this.prisma.heroSlide.create({
      data: {
        entity: 'ARTA',
        title: dto.title,
        subtitle: dto.subtitle,
        imageUrl: dto.imageUrl,
        ctaLabel: dto.ctaLabel,
        ctaHref: dto.ctaHref,
        sortOrder: dto.sortOrder ?? 0,
        active: publisher ? (dto.active ?? true) : false,
      },
    });
  }

  /** Lo que ya está en el sitio solo lo cambia quien publica. */
  private async assertSlideDraft(user: StudioUser, id: string, activate?: boolean) {
    if (this.canPublish(user)) return;
    if (activate === true) throw new ForbiddenException('Solo dirección activa slides en el sitio');
    const slide = await this.prisma.heroSlide.findUnique({ where: { id }, select: { active: true } });
    if (!slide) throw new NotFoundException('Slide no encontrado');
    if (slide.active) {
      throw new ForbiddenException('Ese slide está en el sitio: pide a dirección que lo desactive para editarlo');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Put('slides/:id')
  async updateSlide(
    @Req() req: { user: StudioUser },
    @Param('id') id: string,
    @Body() dto: SlideDto,
  ) {
    this.assertStudioWrite(req.user);
    await this.assertSlideDraft(req.user, id, dto.active);
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
  async deleteSlide(
    @Req() req: { user: StudioUser },
    @Param('id') id: string,
  ) {
    this.assertStudioWrite(req.user);
    await this.assertSlideDraft(req.user, id);
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

  /** «Evento destacado» no sale al sitio sin la fecha del show. */
  private assertPublishable(published: boolean | undefined, template: string | null | undefined, eventDate: Date | null | undefined) {
    if (published && template === 'evento' && !eventDate) {
      throw new BadRequestException('Un «Evento destacado» necesita la fecha del show para publicarse');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('news')
  async createNews(
    @Req() req: { user: StudioUser },
    @Body() dto: NewsDto,
  ) {
    this.assertStudioWrite(req.user);
    if (dto.published) this.assertPublish(req.user, 'Tu noticia queda como borrador: dirección la revisa y la publica');
    const fields = newsTemplateFields(dto);
    this.assertPublishable(dto.published, fields.template, fields.eventDate);
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
        template: fields.template ?? null,
        eventDate: fields.eventDate ?? null,
        ctaLabel: fields.ctaLabel ?? null,
        ctaHref: fields.ctaHref ?? null,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put('news/:id')
  async updateNews(
    @Req() req: { user: StudioUser },
    @Param('id') id: string,
    @Body() dto: NewsDto,
  ) {
    this.assertStudioWrite(req.user);
    const publisher = this.canPublish(req.user);
    const existing = await this.prisma.newsPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Noticia no encontrada');
    if (!publisher) {
      if (dto.published) throw new ForbiddenException('Solo dirección publica noticias');
      if (existing.published) {
        throw new ForbiddenException('Esa noticia ya está en el sitio: pide a dirección que la despublique para editarla');
      }
    }
    const fields = newsTemplateFields(dto);
    this.assertPublishable(
      dto.published ?? existing.published,
      fields.template === undefined ? existing.template : fields.template,
      fields.eventDate === undefined ? existing.eventDate : fields.eventDate,
    );
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
        template: fields.template,
        eventDate: fields.eventDate,
        ctaLabel: fields.ctaLabel,
        ctaHref: fields.ctaHref,
        // Publicada (o regresada a borrador por dirección) ya no espera revisión.
        ...(dto.published !== undefined && publisher ? { reviewRequestedAt: null } : {}),
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('news/:id')
  async deleteNews(
    @Req() req: { user: StudioUser },
    @Param('id') id: string,
  ) {
    this.assertStudioWrite(req.user);
    if (!this.canPublish(req.user)) {
      const post = await this.prisma.newsPost.findUnique({ where: { id }, select: { published: true } });
      if (!post) throw new NotFoundException('Noticia no encontrada');
      if (post.published) throw new ForbiddenException('Solo dirección quita noticias publicadas');
    }
    return this.prisma.newsPost.delete({ where: { id } });
  }

  /**
   * «Enviar a revisión»: el practicante avisa que su borrador (noticia, slide o propuesta de
   * sección) está listo. Le llega a quien publica en el sitio; la noticia queda marcada «En revisión».
   */
  @UseGuards(JwtAuthGuard)
  @Post('review')
  async requestReview(@Req() req: { user: StudioUser }, @Body() dto: ReviewDto) {
    this.assertStudioWrite(req.user);
    let label = '';
    let tab = 'news';
    if (dto.kind === 'news') {
      const post = await this.prisma.newsPost.findUnique({ where: { id: dto.id } });
      if (!post) throw new NotFoundException('Noticia no encontrada');
      if (post.published) throw new BadRequestException('Esa noticia ya está publicada');
      await this.prisma.newsPost.update({ where: { id: post.id }, data: { reviewRequestedAt: new Date() } });
      label = `la noticia «${post.title}»`;
    } else if (dto.kind === 'slide') {
      const slide = await this.prisma.heroSlide.findUnique({ where: { id: dto.id } });
      if (!slide) throw new NotFoundException('Slide no encontrado');
      if (slide.active) throw new BadRequestException('Ese slide ya está en el sitio');
      label = `el slide «${slide.title || 'sin título'}»`;
      tab = 'carousel';
    } else {
      const proposal = await this.prisma.pageContent.findUnique({
        where: { entity_sectionKey: { entity: 'ARTA', sectionKey: `${dto.id}${PROPOSAL_SUFFIX}` } },
      });
      if (!proposal) throw new NotFoundException('No hay propuesta para esa sección');
      label = `un cambio a la sección «${proposal.title || dto.id}»`;
      tab = 'sections';
    }

    let notified = 0;
    if (this.notifications) {
      const organizationId = tenantIdOf(req.user);
      const publishers = await this.notifications.whoCan({
        organizationId,
        entity: 'ARTA',
        permission: PERMISSIONS.STUDIO_PUBLISH,
        exclude: req.user.id ?? null,
      });
      const rows = await this.notifications
        .notifyMany(
          publishers.map((userId) => ({
            userId,
            organizationId,
            actorId: req.user.id ?? null,
            type: 'studio.review',
            title: `${req.user.fullName || 'Un practicante'} mandó a revisión ${label}`,
            body: 'Revísalo en Studio y publícalo cuando esté listo.',
            linkUrl: `/studio?tab=${tab}`,
            entity: 'ARTA' as const,
          })),
        )
        .catch(() => []);
      notified = (Array.isArray(rows) ? rows : []).filter(Boolean).length;
    }
    return { ok: true, notified };
  }
}
