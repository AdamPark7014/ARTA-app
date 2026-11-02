import {
  BadRequestException,
  Body,
  ConflictException,
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
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
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

/** Fila con el orden y la visibilidad de las secciones del inicio (lo edita la maqueta de Studio). */
export const LAYOUT_KEY = 'site_layout';
/** Secciones que se agregan desde Studio («Texto con foto», «Anuncio»): se pueden borrar. */
export const CUSTOM_BLOCK_PREFIX = 'bloque_';

/** Historias, fotos de la galería y logos de aliados (`SiteItem`). */
export const SITE_ITEM_KINDS = ['historia', 'foto', 'aliado'] as const;
export type SiteItemKind = (typeof SITE_ITEM_KINDS)[number];

/** Encuadre de la foto cuando el espacio la recorta. */
export const MEDIA_FOCUS = ['arriba', 'centro', 'abajo'] as const;

/** Estado de la venta de un show en la cartelera. */
export const SHOW_STATUSES = ['venta', 'pronto', 'agotado', 'pospuesto', 'cancelado'] as const;

export class UpsertPageDto {
  @IsString()
  sectionKey!: string;

  @IsOptional() @IsString() title?: string;

  /*
   * Sin este decorador el `whitelist` del ValidationPipe tiraba el campo: guardar una sección
   * contestaba 200 y no cambiaba nada (y en una sección nueva tronaba). Encontrado el 01-11-2026.
   */
  @IsObject() contentJson!: object;

  @IsOptional() @IsBoolean() published?: boolean;

  /** Guardar sin tocar lo publicado: queda como borrador en la fila de propuesta, también para quien publica. */
  @IsOptional() @IsBoolean() draft?: boolean;
}

class PublishPagesDto {
  /** Secciones a publicar; sin lista, todos los borradores. */
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(100) keys?: string[];
}

class SlideDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsString() imageUrl!: string;
  @IsOptional() @IsString() ctaLabel?: string;
  @IsOptional() @IsString() ctaHref?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() focus?: string | null;
}

class SiteItemDto {
  @IsOptional() @IsIn(SITE_ITEM_KINDS as unknown as string[]) kind?: SiteItemKind;
  @IsOptional() @IsString() @MaxLength(160) title?: string | null;
  @IsOptional() @IsString() @MaxLength(600) caption?: string | null;
  @IsOptional() @IsString() @MaxLength(500) mediaUrl?: string;
  @IsOptional() @IsIn(['image', 'video']) mediaType?: 'image' | 'video';
  @IsOptional() @IsString() focus?: string | null;
  @IsOptional() @IsString() @MaxLength(60) linkLabel?: string | null;
  @IsOptional() @IsString() @MaxLength(500) linkHref?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class ReorderDto {
  @IsIn(['slide', 'news', ...SITE_ITEM_KINDS]) kind!: 'slide' | 'news' | SiteItemKind;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(500) ids!: string[];
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
  /** Datos de la cartelera (plantilla «Evento destacado»). */
  @IsOptional() @IsString() @MaxLength(160) venue?: string | null;
  @IsOptional() @IsString() @MaxLength(120) city?: string | null;
  @IsOptional() @IsString() @MaxLength(5) eventTime?: string | null;
  @IsOptional() @IsString() showStatus?: string | null;
}

class ReviewDto {
  @IsIn(['news', 'slide', 'section', 'item']) kind!: 'news' | 'slide' | 'section' | 'item';
  @IsString() id!: string;
}

/** Enlaces que puede llevar el botón de una publicación: web, ruta del sitio, ancla, correo o teléfono. */
export function isSafeCtaHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return !/\s/.test(value);
  return /^[/#]/.test(value) && !value.startsWith('//');
}

/** Fotos y videos del sitio: lo subido a /uploads o una dirección https. Nada de `javascript:` ni `data:`. */
export function isSafeMediaUrl(url: string): boolean {
  const value = url.trim();
  if (/\s/.test(value)) return false;
  return value.startsWith('/uploads/') || /^https:\/\//i.test(value);
}

function cleanOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const v = (value ?? '').trim();
  return v ? v : null;
}

function assertSafeLink(href: string | null | undefined) {
  if (href && !isSafeCtaHref(href)) {
    throw new BadRequestException('El enlace del botón debe empezar con https://, /, #, mailto: o tel:');
  }
}

function focusField(value: string | null | undefined): string | null | undefined {
  const focus = cleanOptional(value);
  if (focus && !(MEDIA_FOCUS as readonly string[]).includes(focus)) {
    throw new BadRequestException('Encuadre inválido: usa arriba, centro o abajo');
  }
  return focus;
}

/** Inicio del día de hoy en Puebla (UTC-6, sin horario de verano): un show sale de cartelera al terminar su día. */
export function startOfTodayMx(now = new Date()): Date {
  const local = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** Un show publicado en la cartelera: «Evento destacado» con su fecha. */
const SHOW_TEMPLATE = 'evento';

/** Ojo: `{ template: { not: 'evento' } }` deja fuera los NULL en SQL, y la mayoría de las notas viejas no tiene plantilla. */
const NOT_A_SHOW = { OR: [{ template: null }, { template: { not: SHOW_TEMPLATE } }] };

const NEWS_ORDER: Prisma.NewsPostOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { publishedAt: { sort: 'desc', nulls: 'first' } },
  { createdAt: 'desc' },
];

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
  assertSafeLink(ctaHref);
  const eventTime = cleanOptional(dto.eventTime);
  if (eventTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(eventTime)) {
    throw new BadRequestException('Hora del show inválida (HH:MM)');
  }
  const showStatus = cleanOptional(dto.showStatus);
  if (showStatus && !(SHOW_STATUSES as readonly string[]).includes(showStatus)) {
    throw new BadRequestException('Estado de la venta inválido');
  }
  if (dto.coverUrl && !isSafeMediaUrl(dto.coverUrl)) {
    throw new BadRequestException('La portada debe ser una imagen subida o una dirección https');
  }
  return {
    template: template as NewsTemplate | null | undefined,
    eventDate,
    ctaLabel,
    ctaHref,
    venue: cleanOptional(dto.venue),
    city: cleanOptional(dto.city),
    eventTime,
    showStatus,
  };
}

/** Dos notas no pueden compartir dirección: se le dice a quien edita en lugar de un 500. */
async function friendlySlugConflict<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new ConflictException('Ya hay otra publicación con esa dirección: cambia el título o el slug');
    }
    throw err;
  }
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
      select: {
        slug: true,
        publishedAt: true,
        updatedAt: true,
        coverUrl: true,
        title: true,
        excerpt: true,
        template: true,
        eventDate: true,
        sortOrder: true,
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /** Público — cartelera completa: lo que viene y lo que ya pasó (antes de public/:entity). */
  @Get('public/shows')
  async publicShows() {
    const today = startOfTodayMx();
    const published = { entity: 'ARTA' as EntityKey, published: true, template: SHOW_TEMPLATE };
    const [upcoming, past] = await Promise.all([
      this.prisma.newsPost.findMany({
        where: { ...published, eventDate: { gte: today } },
        orderBy: { eventDate: 'asc' },
        take: 60,
      }),
      this.prisma.newsPost.findMany({
        where: { ...published, eventDate: { lt: today } },
        orderBy: { eventDate: 'desc' },
        take: 24,
      }),
    ]);
    return { upcoming, past };
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
    const [pages, slides, news, shows, items] = await Promise.all([
      this.prisma.pageContent.findMany({ where: { entity: e, published: true } }),
      this.prisma.heroSlide.findMany({
        where: { entity: e, active: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.newsPost.findMany({
        where: { entity: e, published: true, ...NOT_A_SHOW },
        orderBy: NEWS_ORDER,
        take: 12,
      }),
      this.prisma.newsPost.findMany({
        where: { entity: e, published: true, template: SHOW_TEMPLATE, eventDate: { gte: startOfTodayMx() } },
        orderBy: { eventDate: 'asc' },
        take: 24,
      }),
      this.prisma.siteItem.findMany({
        where: { entity: e, active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    return { pages, slides, news, shows, items };
  }

  /**
   * Vista previa de Studio: lo mismo que el sitio público más lo que aún no se publica. Los borradores
   * de sección pisan a la sección publicada (`draft: true`); noticias, slides e historias sin publicar
   * llegan con su propio estado para que la vista previa los marque.
   */
  @UseGuards(JwtAuthGuard)
  @Get('preview')
  async preview(@Req() req: { user: { roleKey: string; permissions: string[] } }) {
    this.assertStudio(req.user);
    const e: EntityKey = 'ARTA';
    const [rows, slides, news, shows, items] = await Promise.all([
      this.prisma.pageContent.findMany({ where: { entity: e } }),
      this.prisma.heroSlide.findMany({ where: { entity: e }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.newsPost.findMany({ where: { entity: e, ...NOT_A_SHOW }, orderBy: NEWS_ORDER, take: 40 }),
      this.prisma.newsPost.findMany({
        where: {
          entity: e,
          template: SHOW_TEMPLATE,
          OR: [{ eventDate: null }, { eventDate: { gte: startOfTodayMx() } }],
        },
        orderBy: { eventDate: 'asc' },
        take: 40,
      }),
      this.prisma.siteItem.findMany({
        where: { entity: e },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    const merged = new Map<string, (typeof rows)[number] & { draft?: boolean }>();
    for (const row of rows) {
      if (!row.sectionKey.endsWith(PROPOSAL_SUFFIX) && row.published) merged.set(row.sectionKey, row);
    }
    for (const row of rows) {
      if (!row.sectionKey.endsWith(PROPOSAL_SUFFIX)) continue;
      const sectionKey = row.sectionKey.slice(0, -PROPOSAL_SUFFIX.length);
      merged.set(sectionKey, { ...row, sectionKey, draft: true });
    }
    return { pages: [...merged.values()], slides, news, shows, items };
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
    // El practicante siempre escribe su propuesta; quien publica, solo si pide guardar como borrador.
    const asDraft = !publisher || dto.draft === true;
    const sectionKey = asDraft ? `${baseKey}${PROPOSAL_SUFFIX}` : baseKey;
    const page = await this.prisma.pageContent.upsert({
      where: { entity_sectionKey: { entity: 'ARTA', sectionKey } },
      create: {
        entity: 'ARTA',
        sectionKey,
        title: dto.title,
        contentJson: dto.contentJson as Prisma.InputJsonValue,
        published: asDraft ? false : (dto.published ?? false),
      },
      update: {
        title: dto.title,
        contentJson: dto.contentJson as Prisma.InputJsonValue,
        published: asDraft ? false : dto.published,
      },
    });
    if (!asDraft) {
      await this.prisma.pageContent.deleteMany({
        where: { entity: 'ARTA', sectionKey: `${baseKey}${PROPOSAL_SUFFIX}` },
      });
      if (baseKey === LAYOUT_KEY && dto.published) await this.removeOrphanBlocks(dto.contentJson);
    }
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: asDraft ? 'studio.proposal' : 'studio.upsert',
        resource: 'PageContent',
        resourceId: page.id,
        metaJson: { sectionKey },
      },
    });
    return { ...page, proposal: asDraft };
  }

  /** Publicar borradores de sección (de quien publica o de un practicante): la propuesta pasa a ser la sección. */
  @UseGuards(JwtAuthGuard)
  @Post('pages/publish')
  async publishPages(@Req() req: { user: StudioUser }, @Body() dto: PublishPagesDto) {
    this.assertStudioWrite(req.user);
    this.assertPublish(req.user, 'Solo quien publica deja los cambios en el sitio');
    const wanted = dto?.keys?.map((k) => `${k}${PROPOSAL_SUFFIX}`);
    const proposals = await this.prisma.pageContent.findMany({
      where: {
        entity: 'ARTA',
        ...(wanted ? { sectionKey: { in: wanted } } : { sectionKey: { endsWith: PROPOSAL_SUFFIX } }),
      },
    });
    const published: string[] = [];
    for (const proposal of proposals) {
      const sectionKey = proposal.sectionKey.slice(0, -PROPOSAL_SUFFIX.length);
      const content = proposal.contentJson as Prisma.InputJsonValue;
      const page = await this.prisma.pageContent.upsert({
        where: { entity_sectionKey: { entity: 'ARTA', sectionKey } },
        create: { entity: 'ARTA', sectionKey, title: proposal.title, contentJson: content, published: true },
        update: { title: proposal.title, contentJson: content, published: true },
      });
      await this.prisma.pageContent.delete({ where: { id: proposal.id } });
      published.push(sectionKey);
      await this.prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'studio.publish',
          resource: 'PageContent',
          resourceId: page.id,
          metaJson: { sectionKey },
        },
      });
    }
    const layout = proposals.find((p) => p.sectionKey === `${LAYOUT_KEY}${PROPOSAL_SUFFIX}`);
    if (layout) await this.removeOrphanBlocks(layout.contentJson);
    return { ok: true, published };
  }

  /** Al publicar la maqueta, las secciones agregadas que ya no están en ella dejan de existir. */
  private async removeOrphanBlocks(layout: unknown) {
    const blocks = (layout as { blocks?: Array<{ id?: unknown }> } | null)?.blocks;
    if (!Array.isArray(blocks)) return;
    const keep = new Set(blocks.map((b) => `${CUSTOM_BLOCK_PREFIX}${String(b?.id ?? '')}`));
    const rows = await this.prisma.pageContent.findMany({
      where: { entity: 'ARTA', sectionKey: { startsWith: CUSTOM_BLOCK_PREFIX } },
      select: { id: true, sectionKey: true },
    });
    const orphans = rows.filter((r) => !keep.has(r.sectionKey.replace(PROPOSAL_SUFFIX, '')));
    if (orphans.length) {
      await this.prisma.pageContent.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    }
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
    this.assertSlideFields(dto);
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
        focus: focusField(dto.focus) ?? null,
      },
    });
  }

  /** La imagen y el botón de un slide llegan a una página pública: mismas reglas que una noticia. */
  private assertSlideFields(dto: SlideDto) {
    if (dto.imageUrl && !isSafeMediaUrl(dto.imageUrl)) {
      throw new BadRequestException('La imagen debe ser un archivo subido o una dirección https');
    }
    assertSafeLink(cleanOptional(dto.ctaHref));
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
    this.assertSlideFields(dto);
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
        focus: focusField(dto.focus),
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
      orderBy: NEWS_ORDER,
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
    return friendlySlugConflict(
      this.prisma.newsPost.create({
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
          venue: fields.venue ?? null,
          city: fields.city ?? null,
          eventTime: fields.eventTime ?? null,
          showStatus: fields.showStatus ?? null,
        },
      }),
    );
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
    // Corregir una nota ya publicada no le cambia la fecha; sin `published` en el cuerpo no se toca.
    const publishedAt =
      dto.published === undefined ? undefined : dto.published ? (existing.publishedAt ?? new Date()) : null;
    return friendlySlugConflict(
      this.prisma.newsPost.update({
        where: { id },
        data: {
          slug: dto.slug,
          title: dto.title,
          excerpt: dto.excerpt,
          body: dto.body,
          coverUrl: dto.coverUrl,
          published: dto.published,
          publishedAt,
          template: fields.template,
          eventDate: fields.eventDate,
          ctaLabel: fields.ctaLabel,
          ctaHref: fields.ctaHref,
          venue: fields.venue,
          city: fields.city,
          eventTime: fields.eventTime,
          showStatus: fields.showStatus,
          // Publicada (o regresada a borrador por dirección) ya no espera revisión.
          ...(dto.published !== undefined && publisher ? { reviewRequestedAt: null } : {}),
        },
      }),
    );
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

  // ─── Historias, galería y aliados ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('items')
  items(@Req() req: { user: { roleKey: string; permissions: string[] } }, @Query('kind') kind?: string) {
    this.assertStudio(req.user);
    return this.prisma.siteItem.findMany({
      where: { entity: 'ARTA', ...(kind ? { kind } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  private itemFields(dto: SiteItemDto) {
    if (dto.mediaUrl !== undefined && !isSafeMediaUrl(dto.mediaUrl)) {
      throw new BadRequestException('El archivo debe estar subido o ser una dirección https');
    }
    const linkHref = cleanOptional(dto.linkHref);
    assertSafeLink(linkHref);
    return {
      title: cleanOptional(dto.title),
      caption: cleanOptional(dto.caption),
      mediaUrl: dto.mediaUrl?.trim(),
      mediaType: dto.mediaType,
      focus: focusField(dto.focus),
      linkLabel: cleanOptional(dto.linkLabel),
      linkHref,
      sortOrder: dto.sortOrder,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('items')
  async createItem(@Req() req: { user: StudioUser }, @Body() dto: SiteItemDto) {
    this.assertStudioWrite(req.user);
    if (!dto.kind) throw new BadRequestException('Falta el tipo de contenido');
    if (!dto.mediaUrl?.trim()) throw new BadRequestException('Sube una foto o un video');
    if (dto.active) this.assertPublish(req.user, 'Lo tuyo queda como borrador: dirección lo revisa y lo publica');
    const fields = this.itemFields(dto);
    const first = await this.prisma.siteItem.findFirst({
      where: { entity: 'ARTA', kind: dto.kind },
      orderBy: { sortOrder: 'asc' },
      select: { sortOrder: true },
    });
    const item = await this.prisma.siteItem.create({
      data: {
        entity: 'ARTA',
        kind: dto.kind,
        ...fields,
        mediaUrl: fields.mediaUrl as string,
        mediaType: fields.mediaType ?? 'image',
        // Lo nuevo entra hasta arriba de su lista.
        sortOrder: fields.sortOrder ?? (first ? first.sortOrder - 1 : 0),
        active: dto.active ?? false,
      },
    });
    await this.auditItem(req.user, dto.active ? 'studio.item.publish' : 'studio.item.create', item.id);
    return item;
  }

  /** Lo que ya está en el sitio solo lo cambia quien publica (misma regla que slides y noticias). */
  private async assertItemDraft(user: StudioUser, id: string, activate?: boolean) {
    const item = await this.prisma.siteItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('No encontramos ese contenido');
    if (this.canPublish(user)) return item;
    if (activate === true) throw new ForbiddenException('Solo dirección publica en el sitio');
    if (item.active) {
      throw new ForbiddenException('Eso ya está en el sitio: pide a dirección que lo despublique para editarlo');
    }
    return item;
  }

  @UseGuards(JwtAuthGuard)
  @Put('items/:id')
  async updateItem(@Req() req: { user: StudioUser }, @Param('id') id: string, @Body() dto: SiteItemDto) {
    this.assertStudioWrite(req.user);
    const existing = await this.assertItemDraft(req.user, id, dto.active);
    const item = await this.prisma.siteItem.update({
      where: { id },
      data: {
        ...this.itemFields(dto),
        active: dto.active,
        // Publicado (o regresado a borrador) por quien publica: ya no espera revisión.
        ...(dto.active !== undefined && this.canPublish(req.user) ? { reviewRequestedAt: null } : {}),
      },
    });
    if (dto.active !== undefined && dto.active !== existing.active) {
      await this.auditItem(req.user, dto.active ? 'studio.item.publish' : 'studio.item.unpublish', id);
    }
    return item;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('items/:id')
  async deleteItem(@Req() req: { user: StudioUser }, @Param('id') id: string) {
    this.assertStudioWrite(req.user);
    await this.assertItemDraft(req.user, id);
    await this.auditItem(req.user, 'studio.item.delete', id);
    return this.prisma.siteItem.delete({ where: { id } });
  }

  private auditItem(user: StudioUser, action: string, id: string) {
    return this.prisma.auditLog.create({
      data: { userId: user.id, action, resource: 'SiteItem', resourceId: id, metaJson: {} },
    });
  }

  /**
   * «Subir» y «Bajar»: `ids` trae la lista completa en su orden nuevo. El practicante acomoda sus
   * borradores, pero el orden entre lo que ya está publicado solo lo cambia quien publica.
   */
  @UseGuards(JwtAuthGuard)
  @Post('reorder')
  async reorder(@Req() req: { user: StudioUser }, @Body() dto: ReorderDto) {
    this.assertStudioWrite(req.user);
    const rows = await this.orderableRows(dto.kind);
    const known = new Map(rows.map((r) => [r.id, r]));
    if (new Set(dto.ids).size !== dto.ids.length || dto.ids.some((id) => !known.has(id))) {
      throw new BadRequestException('La lista no coincide con el contenido actual: recarga e inténtalo de nuevo');
    }
    if (!this.canPublish(req.user)) {
      const live = (ids: string[]) => ids.filter((id) => known.get(id)?.live);
      if (live(rows.map((r) => r.id)).join() !== live(dto.ids).join()) {
        throw new ForbiddenException('El orden de lo publicado lo cambia dirección: mueve solo tus borradores');
      }
    }
    await this.prisma.$transaction(
      dto.ids.map((id, index) => {
        const where = { id };
        const data = { sortOrder: index };
        if (dto.kind === 'slide') return this.prisma.heroSlide.update({ where, data });
        if (dto.kind === 'news') return this.prisma.newsPost.update({ where, data });
        return this.prisma.siteItem.update({ where, data });
      }),
    );
    return { ok: true };
  }

  private async orderableRows(kind: ReorderDto['kind']): Promise<Array<{ id: string; live: boolean }>> {
    if (kind === 'slide') {
      const rows = await this.prisma.heroSlide.findMany({ where: { entity: 'ARTA' }, orderBy: { sortOrder: 'asc' } });
      return rows.map((r) => ({ id: r.id, live: r.active }));
    }
    if (kind === 'news') {
      const rows = await this.prisma.newsPost.findMany({ where: { entity: 'ARTA' }, orderBy: NEWS_ORDER });
      return rows.map((r) => ({ id: r.id, live: r.published }));
    }
    const rows = await this.prisma.siteItem.findMany({
      where: { entity: 'ARTA', kind },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({ id: r.id, live: r.active }));
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
    } else if (dto.kind === 'item') {
      const item = await this.prisma.siteItem.findUnique({ where: { id: dto.id } });
      if (!item) throw new NotFoundException('No encontramos ese contenido');
      if (item.active) throw new BadRequestException('Eso ya está en el sitio');
      await this.prisma.siteItem.update({ where: { id: item.id }, data: { reviewRequestedAt: new Date() } });
      const what = { historia: 'la historia', foto: 'la foto', aliado: 'el aliado' }[item.kind] || 'el contenido';
      label = `${what} «${item.title || 'sin título'}»`;
      tab = item.kind;
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
