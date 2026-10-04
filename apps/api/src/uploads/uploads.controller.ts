import {
  Controller,
  Post,
  Put,
  Delete,
  Get,
  Patch,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Body,
  Req,
  Optional,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NotificationsService } from '../notifications/notifications.service';
import { extname, join, basename } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { DocType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { canAccessEventOps, hasPermission, isDirectionRole, PERMISSIONS, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { MULTER_OPTIONS, contentMatchesExtension, discardUpload, uploadRoot } from './upload-storage';
import { assertSameTenant } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import { actorFrom, RevisionService } from '../common/revisions/revision.service';
import { diffBinary } from '../common/doc-diff';
import { XlsxPatchService, type CellPatch } from './xlsx-patch.service';
import { ExcelPdfService } from './excel-pdf.service';
import { cleanDisplayTitle } from './pdf-branding.service';
import { buildSheetModel } from './sheet-layout';
import * as ExcelJS from 'exceljs';
import { FinanceExtractService } from '../finance/finance-extract.service';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(
    private prisma: PrismaService,
    private revisions: RevisionService,
    private xlsx: XlsxPatchService,
    private excelPdf: ExcelPdfService,
    private financeExtract: FinanceExtractService,
    @Optional() private notifications?: NotificationsService,
  ) {}

  /**
   * Archivo nuevo, borrado o recuperado: al equipo del evento (canal Documentos).
   * Guardar contenido no avisa: el panel guarda seguido y sería ruido.
   */
  private async tellTeam(user: AuthUser & { fullName?: string }, eventId: string | null, type: string, verb: string, fileName: string) {
    if (!this.notifications || !eventId) return;
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, entity: true, organizationId: true },
      });
      if (!event) return;
      await this.notifications.notifyEventTeam(event.id, {
        organizationId: event.organizationId,
        actorId: user.id,
        type,
        title: `${user.fullName || 'Alguien del equipo'} ${verb}`,
        body: `${fileName} · ${event.name}`,
        linkUrl: `/events/${event.id}?tab=files`,
        entity: event.entity,
      });
    } catch {
      /* un aviso que falla no tumba la operación */
    }
  }

  /**
   * Si el archivo es la corrida, se releen sus cifras para que los KPIs de
   * dirección salgan del Excel y no de una tabla paralela que nadie llena.
   */
  private async syncFinanceIfNeeded(file: { eventId: string | null; module: string | null }) {
    if (file.module !== 'finance' || !file.eventId) return;
    await this.financeExtract.syncFromEventWorkbook(file.eventId);
  }

  /** Huella del contenido, para saber si un guardado cambió algo de verdad. */
  private hashOf(path: string): string | null {
    try {
      return createHash('sha256').update(readFileSync(path)).digest('hex');
    } catch {
      return null;
    }
  }

  private diskPathOf(url: string): string {
    // `/uploads/foo.xlsx` o `/uploads/sheet-pdfs/foo.pdf`
    const rel = url.replace(/^\/uploads\//, '');
    return join(uploadRoot, rel);
  }

  /**
   * Un `.xlsx` con gráficas o tablas dinámicas no se puede editar en el panel
   * sin degradarlo: se marca para que la UI lo muestre en solo lectura y
   * explique por qué, en vez de comérselo en silencio.
   */
  private inspectIfWorkbook(filePath: string, fileName: string) {
    if (!/\.xlsx$/i.test(fileName)) return { panelEditable: true, panelBlockReason: null };
    try {
      const result = this.xlsx.inspectWorkbook(readFileSync(filePath));
      return { panelEditable: result.editable, panelBlockReason: result.reason };
    } catch {
      return { panelEditable: false, panelBlockReason: 'No se pudo leer el libro' };
    }
  }

  /**
   * Deja constancia de esta versión del binario.
   *
   * Cada revisión apunta al archivo TAL COMO quedó tras ese guardado, y el
   * anterior sigue en disco referenciado por su propia revisión: por eso ahora
   * se puede volver atrás. Antes el blob viejo quedaba huérfano, sin ninguna
   * fila que lo mencionara — irrecuperable desde la aplicación.
   */
  private async recordFileRevision(
    file: { id: string; eventId: string | null; url: string; fileName: string; sizeBytes: number | null; sha256: string | null; version: number },
    event: { organizationId: string | null } | null,
    previous: { url: string; sha256: string | null; sizeBytes: number | null; fileName: string } | null,
    req: { user: { id: string }; ip?: string; headers?: Record<string, string> },
    note: string,
  ) {
    // `DocRevision` cuelga de un evento; un archivo suelto no tiene historial.
    if (!file.eventId) return;
    try {
      await this.revisions.record({
        organizationId: event?.organizationId || '(sin-organizacion)',
        eventId: file.eventId,
        docType: DocType.FILE,
        docId: file.id,
        revision: file.version,
        fileUrl: file.url,
        fileHash: file.sha256,
        sizeBytes: file.sizeBytes,
        diff: diffBinary(
          previous ? { fileName: previous.fileName, hash: previous.sha256, sizeBytes: previous.sizeBytes } : null,
          { fileName: file.fileName, hash: file.sha256, sizeBytes: file.sizeBytes },
        ),
        note,
        actor: actorFrom(req as never),
      });
    } catch (e) {
      // Una revisión repetida (misma versión ya anotada) es contabilidad, no
      // motivo para tumbar la operación que ya se hizo en disco y en la base.
      if ((e as { code?: string })?.code === 'P2002') return;
      throw e;
    }
  }

  private async assertEventOps(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException('Sin acceso a archivos de este evento');
    }
    assertSameTenant(user, event.organizationId);
    return event;
  }

  /**
   * Reemplazar o borrar un adjunto exige el permiso de SU sección, no solo
   * acceso operativo al evento: el Excel de la corrida lo podían pisar o
   * borrar roles que únicamente tienen `finance.view`.
   */
  private assertFileEditPermission(user: AuthUser, module?: string | null) {
    const needed =
      module === 'finance'
        ? PERMISSIONS.FINANCE_EDIT
        : module === 'campaign'
          ? PERMISSIONS.CAMPAIGN_EDIT
          : PERMISSIONS.CHECKLIST_EDIT;
    if (!hasPermission(user.roleKey as RoleKey, user.permissions, needed)) {
      throw new ForbiddenException('Sin permiso para modificar los archivos de esta sección');
    }
  }

  /**
   * Un `EventFile` sin evento no tiene contra qué comprobar acceso, así que
   * antes se saltaba TODOS los controles. Se exige el mismo permiso elevado
   * que ya pide la subida sin evento.
   */
  /**
   * El nombre y el `Content-Type` los pone quien sube: hay que mirar el
   * contenido. Si no cuadra, el archivo ya está en disco (multer escribe
   * antes), así que se borra.
   */
  private assertRealFileType(file: Express.Multer.File) {
    if (!contentMatchesExtension(file.path, file.originalname)) {
      discardUpload(file.path);
      throw new BadRequestException(
        'El contenido del archivo no corresponde a su extensión',
      );
    }
  }

  private assertOrphanFileEdit(user: AuthUser) {
    const allowed =
      hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.CHECKLIST_EDIT) ||
      hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.STUDIO_EDIT);
    if (!allowed) throw new ForbiddenException('Sin permiso sobre archivos fuera de un evento');
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async upload(
    @Req() req: { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { eventId?: string; checklistId?: string; kind?: string; module?: string },
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    this.assertRealFileType(file);
    const mime = file.mimetype || 'application/octet-stream';
    let kind = body.kind || 'other';
    if (!body.kind) {
      if (mime.includes('pdf')) kind = 'pdf';
      else if (mime.includes('sheet') || mime.includes('excel') || file.originalname.match(/\.xlsx?$/i))
        kind = 'excel';
      else if (mime.startsWith('image/')) kind = 'image';
    }

    const url = `/uploads/${file.filename}`;

    // Upload suelto (Studio, anticipos, etc.) — requiere permiso explícito
    if (!body.eventId && !body.checklistId) {
      const perms = req.user.permissions || [];
      const role = req.user.roleKey as RoleKey;
      const allowedLoose =
        hasPermission(role, perms, PERMISSIONS.STUDIO_EDIT) ||
        hasPermission(role, perms, PERMISSIONS.CHECKLIST_EDIT) ||
        hasPermission(role, perms, PERMISSIONS.EVERYTHING);
      if (!allowedLoose) {
        throw new ForbiddenException(
          'Subida sin evento requiere permiso Studio o edición de checklists',
        );
      }
      return { id: null, url, fileName: file.originalname, mimeType: mime, kind, sizeBytes: file.size };
    }

    let eventId = body.eventId;
    if (body.checklistId && !eventId) {
      const cl = await this.prisma.checklistInstance.findUnique({
        where: { id: body.checklistId },
        include: { event: true },
      });
      if (!cl) throw new NotFoundException('Checklist no encontrado');
      if (
        !canAccessEventOps(
          req.user.entities as EntityKey[],
          req.user.roleKey as RoleKey,
          cl.event.entity as EntityKey,
        )
      ) {
        throw new ForbiddenException('Sin acceso a archivos de este evento');
      }
      assertSameTenant(req.user, cl.event.organizationId);
      assertEventNotClosed(cl.event.status);
      eventId = cl.eventId;
    } else if (eventId) {
      const event = await this.assertEventOps(req.user, eventId);
      assertEventNotClosed(event.status);
    }

    const inspection = this.inspectIfWorkbook(file.path, file.originalname);

    const record = await this.prisma.eventFile.create({
      data: {
        eventId: eventId || undefined,
        checklistId: body.checklistId || undefined,
        fileName: file.originalname,
        mimeType: mime,
        url,
        sizeBytes: file.size,
        kind,
        // Sección del evento (campaign, finance…) para poder listar por módulo
        module: body.module ? String(body.module).slice(0, 40) : undefined,
        // Un archivo recién subido no tenía autor en la base: nadie sabía
        // quién lo puso.
        createdById: req.user.id,
        updatedById: req.user.id,
        sha256: this.hashOf(file.path),
        panelEditable: inspection.panelEditable,
        panelBlockReason: inspection.panelBlockReason,
      },
      include: { event: { select: { organizationId: true } } },
    });

    await this.recordFileRevision(record, record.event, null, req, 'Archivo subido');
    // Adjuntos dentro de un formato (fotos de un campo) no son archivos nuevos del evento.
    if (!body.checklistId) {
      void this.tellTeam(req.user, record.eventId, 'file.uploaded', 'subió un archivo', record.fileName);
    }
    return record;
  }

  /**
   * Guardar en el sitio.
   *
   * El panel deja editar el Excel en una hoja de cálculo y escribir encima del
   * PDF; al guardar manda el archivo completo ya reconstruido y aquí se
   * reemplaza el contenido **sin cambiar el id**, para que los enlaces que ya
   * circulan sigan apuntando al mismo documento.
   *
   * El archivo anterior NO se borra del disco: queda como respaldo de la
   * versión previa. La fila apunta al nuevo y sube `version`.
   */
  @Put(':id/content')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async saveInPlace(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    this.assertRealFileType(file);

    const current = await this.prisma.eventFile.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!current) throw new NotFoundException('Archivo no encontrado');
    if (current.event) {
      if (
        !canAccessEventOps(
          req.user.entities as EntityKey[],
          req.user.roleKey as RoleKey,
          current.event.entity as EntityKey,
        )
      ) {
        throw new ForbiddenException('Sin acceso a archivos de este evento');
      }
      assertSameTenant(req.user, current.event.organizationId);
      if (current.event.status === 'CLOSED' || current.event.status === 'CANCELLED') {
        throw new ForbiddenException('Evento cerrado — los archivos quedan en solo lectura');
      }
      this.assertFileEditPermission(req.user, current.module);
      // Candado post-subida: tras quedar registrado como EventFile subido por una persona,
      // solo Dirección puede seguir modificándolo.
      if (current.createdById && !isDirectionRole(req.user.roleKey)) {
        throw new ForbiddenException('Solo dirección puede editar archivos ya subidos');
      }
    } else {
      this.assertOrphanFileEdit(req.user);
    }

    // El tipo no puede cambiar a media edición: un .xlsx se guarda como .xlsx.
    const wasExt = extname(current.fileName || current.url).toLowerCase();
    const nowExt = extname(file.originalname).toLowerCase();
    if (wasExt && nowExt && wasExt !== nowExt) {
      discardUpload(file.path);
      throw new BadRequestException(
        `El archivo guardado debe seguir siendo ${wasExt} (llegó ${nowExt})`,
      );
    }

    const inspection = this.inspectIfWorkbook(file.path, file.originalname);

    const updated = await this.prisma.eventFile.update({
      where: { id },
      data: {
        url: `/uploads/${file.filename}`,
        sizeBytes: file.size,
        mimeType: file.mimetype || current.mimeType,
        version: { increment: 1 },
        updatedById: req.user.id,
        sha256: this.hashOf(file.path),
        panelEditable: inspection.panelEditable,
        panelBlockReason: inspection.panelBlockReason,
      },
      include: { event: { select: { organizationId: true } } },
    });

    /*
     * El archivo anterior sigue en disco y ahora SÍ queda referenciado por su
     * propia revisión, así que se puede descargar y restaurar. Antes quedaba
     * huérfano: irrecuperable desde la aplicación.
     */
    await this.recordFileRevision(
      updated,
      updated.event,
      { url: current.url, sha256: current.sha256, sizeBytes: current.sizeBytes, fileName: current.fileName },
      req,
      'Contenido reemplazado',
    );
    await this.syncFinanceIfNeeded(updated);

    return updated;
  }

  /**
   * Guardado por celdas — la vía buena para las hojas de cálculo.
   *
   * El editor manda SOLO las celdas que cambió y aquí se aplican con ExcelJS
   * sobre el archivo real. Antes el navegador reconstruía el libro entero con
   * SheetJS Community, cuyo writer emite una fuente fija: colores, bordes,
   * formato condicional y validaciones se perdían en TODO el libro en cada
   * guardado.
   */
  @Patch(':id/cells')
  async patchCells(
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> },
    @Param('id') id: string,
    @Body() body: CellPatch,
  ) {
    const current = await this.prisma.eventFile.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!current) throw new NotFoundException('Archivo no encontrado');
    if (current.deletedAt) throw new BadRequestException('El archivo está borrado');
    if (current.event) {
      if (
        !canAccessEventOps(
          req.user.entities as EntityKey[],
          req.user.roleKey as RoleKey,
          current.event.entity as EntityKey,
        )
      ) {
        throw new ForbiddenException('Sin acceso a archivos de este evento');
      }
      assertSameTenant(req.user, current.event.organizationId);
      assertEventNotClosed(current.event.status);
      this.assertFileEditPermission(req.user, current.module);
      if (current.createdById && !isDirectionRole(req.user.roleKey)) {
        throw new ForbiddenException('Solo dirección puede editar archivos ya subidos');
      }
    } else {
      this.assertOrphanFileEdit(req.user);
    }

    if (!/\.xlsx$/i.test(current.fileName)) {
      throw new BadRequestException('Solo se pueden parchear celdas de un .xlsx');
    }
    if (!current.panelEditable) {
      throw new BadRequestException(
        current.panelBlockReason || 'Este libro no se puede editar desde el panel',
      );
    }

    const sourcePath = this.diskPathOf(current.url);
    if (!existsSync(sourcePath)) throw new NotFoundException('El archivo ya no está en disco');

    const patched = await this.xlsx.applyCellPatch(readFileSync(sourcePath), body);

    // Nombre nuevo: la versión anterior se conserva intacta en su propio archivo.
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.xlsx`;
    writeFileSync(join(uploadRoot, filename), patched);

    const updated = await this.prisma.eventFile.update({
      where: { id },
      data: {
        url: `/uploads/${filename}`,
        sizeBytes: patched.length,
        version: { increment: 1 },
        updatedById: req.user.id,
        sha256: createHash('sha256').update(patched).digest('hex'),
      },
      include: { event: { select: { organizationId: true } } },
    });

    await this.recordFileRevision(
      updated,
      updated.event,
      { url: current.url, sha256: current.sha256, sizeBytes: current.sizeBytes, fileName: current.fileName },
      req,
      this.xlsx.describePatch(body),
    );
    await this.syncFinanceIfNeeded(updated);

    return updated;
  }

  /** Historial del archivo: cada versión, con quién la guardó y su huella. */
  @Get(':id/revisions')
  async fileRevisions(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const file = await this.prisma.eventFile.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    if (file.event) {
      if (
        !canAccessEventOps(
          req.user.entities as EntityKey[],
          req.user.roleKey as RoleKey,
          file.event.entity as EntityKey,
        )
      ) {
        throw new ForbiddenException('Sin acceso a archivos de este evento');
      }
      assertSameTenant(req.user, file.event.organizationId);
    }
    return this.revisions.history(DocType.FILE, id);
  }

  /**
   * Cómo se ve la hoja de verdad: celdas combinadas, anchos de columna,
   * negritas, relleno, alineación y bordes — lo que ExcelJS lee del propio
   * libro (la misma fuente que ya usa el PDF de salida). El navegador solo
   * sabe leer valores y fórmulas de un `.xlsx`, no sus estilos; esto es lo
   * que permite que la hoja se vea EN el panel como se ve al salir en PDF.
   *
   * Adam (27-09-2026): «ayúdame a que cuadre y se vea así el Excel».
   *
   * De solo lectura (no cambia nada): se puede pedir aunque el evento esté
   * cerrado. Si algo falla al leerlo, el panel simplemente no aplica estilos
   * y se ve como antes — nunca rompe la edición.
   */
  @Get(':id/layout')
  async sheetLayout(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const file = await this.prisma.eventFile.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    if (!file.eventId || !file.event) {
      throw new BadRequestException('Solo aplica a un Excel ligado a un evento');
    }
    if (
      !canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, file.event.entity as EntityKey)
    ) {
      throw new ForbiddenException('Sin acceso a archivos de este evento');
    }
    assertSameTenant(req.user, file.event.organizationId);

    const ext = extname(file.fileName || file.url).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      throw new BadRequestException('Solo aplica a un Excel');
    }
    const sourcePath = this.diskPathOf(file.url);
    if (!existsSync(sourcePath)) throw new NotFoundException('El Excel ya no está en disco');

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(sourcePath);
    } catch {
      throw new BadRequestException('No se pudo leer el Excel');
    }

    const sheets: Record<string, { colWidths: number[]; cells: unknown[] }> = {};
    for (const ws of wb.worksheets) {
      const model = buildSheetModel(ws, wb);
      sheets[ws.name] = {
        colWidths: model.colWidths,
        cells: model.cells.map((c) => ({
          row: c.row,
          col: c.col,
          rowSpan: c.rowSpan,
          colSpan: c.colSpan,
          bold: c.bold,
          italic: c.italic,
          align: c.align,
          valign: c.valign,
          fill: c.fill,
          color: c.color,
          border: c.border,
        })),
      };
    }
    return { sheets };
  }

  /**
   * Salida oficial del Excel embebido: genera PDF, lo registra como EventFile
   * de la misma sección y deja auditoría de quién exportó.
   *
   * El .xlsx sigue siendo la copia de trabajo interna; lo que circula fuera
   * del sistema es el PDF.
   */
  @Post(':id/pdf')
  async exportPdf(
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> },
    @Param('id') id: string,
  ) {
    const current = await this.prisma.eventFile.findUnique({
      where: { id },
      include: {
        event: true,
        updatedBy: { select: { fullName: true } },
      },
    });
    if (!current) throw new NotFoundException('Archivo no encontrado');
    if (!current.eventId || !current.event) {
      throw new BadRequestException('Solo se exporta Excel ligado a un evento');
    }
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        current.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException('Sin acceso a archivos de este evento');
    }
    assertSameTenant(req.user, current.event.organizationId);
    assertEventNotClosed(current.event.status);

    const ext = extname(current.fileName || current.url).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext) && current.kind !== 'excel') {
      throw new BadRequestException('Solo se puede salir en PDF desde un Excel');
    }

    const exporter = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { fullName: true },
    });

    const sourcePath = this.diskPathOf(current.url);
    if (!existsSync(sourcePath)) {
      throw new NotFoundException('El Excel ya no está en disco');
    }

    const { url } = await this.excelPdf.generate(current.id, current.version, sourcePath, {
      eventName: current.event.name,
      entity: current.event.entity,
      fileName: current.fileName,
      exportedBy: exporter?.fullName || null,
    });

    const outName = cleanDisplayTitle(current.fileName.replace(/\.(xlsx?|csv)$/i, '')) + ' (salida).pdf';
    const existing = await this.prisma.eventFile.findFirst({
      where: {
        eventId: current.eventId,
        kind: 'pdf',
        fileName: outName,
        deletedAt: null,
      },
    });

    const pdfFile = existing
      ? await this.prisma.eventFile.update({
          where: { id: existing.id },
          data: {
            url,
            version: { increment: 1 },
            updatedById: req.user.id,
            module: current.module,
            checklistId: current.checklistId,
            sha256: this.hashOf(this.diskPathOf(url)),
          },
          include: { event: { select: { organizationId: true } } },
        })
      : await this.prisma.eventFile.create({
          data: {
            eventId: current.eventId,
            checklistId: current.checklistId,
            fileName: outName,
            mimeType: 'application/pdf',
            url,
            kind: 'pdf',
            module: current.module,
            updatedById: req.user.id,
            sha256: null,
          },
          include: { event: { select: { organizationId: true } } },
        });

    // Huella tras create (path ya existe)
    if (!pdfFile.sha256) {
      const hash = this.hashOf(this.diskPathOf(url));
      if (hash) {
        await this.prisma.eventFile.update({
          where: { id: pdfFile.id },
          data: { sha256: hash },
        });
      }
    }

    /*
     * La exportación se registra en el PDF de salida, que sube de versión en
     * cada «Salir en PDF». Antes se anotaba además una revisión sobre el Excel
     * de origen con la versión del Excel —que no cambia al exportar—, así que
     * la segunda exportación chocaba con la revisión ya existente
     * (`docType, docId, revision` únicos) y el botón devolvía 500.
     */
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: current.event.organizationId,
        action: 'file.export.pdf',
        resource: 'EventFile',
        resourceId: current.id,
        metaJson: { fileName: current.fileName, version: current.version, pdfFileId: pdfFile.id, pdfVersion: pdfFile.version },
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });

    await this.recordFileRevision(
      {
        id: pdfFile.id,
        eventId: pdfFile.eventId,
        url: pdfFile.url,
        fileName: pdfFile.fileName,
        sizeBytes: pdfFile.sizeBytes,
        sha256: pdfFile.sha256,
        version: pdfFile.version,
      },
      pdfFile.event,
      null,
      req,
      `Generado desde Excel «${current.fileName}» v${current.version}`,
    );

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: current.event.organizationId,
        action: 'file.export_pdf',
        resource: 'EventFile',
        resourceId: current.id,
        metaJson: {
          pdfFileId: pdfFile.id,
          sourceVersion: current.version,
          fileName: current.fileName,
        },
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });

    return {
      url,
      fileId: pdfFile.id,
      version: current.version,
      message: 'PDF de salida listo — el Excel sigue solo dentro del sistema',
    };
  }

  @Delete(':id')
  async remove(
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> },
    @Param('id') id: string,
  ) {
    const file = await this.prisma.eventFile.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');

    if (file.event) {
      if (
        !canAccessEventOps(
          req.user.entities as EntityKey[],
          req.user.roleKey as RoleKey,
          file.event.entity as EntityKey,
        )
      ) {
        throw new ForbiddenException();
      }
      assertSameTenant(req.user, file.event.organizationId);
      assertEventNotClosed(file.event.status);
      this.assertFileEditPermission(req.user, file.module);
      // Borrado solo por Dirección cuando el archivo fue subido por una persona.
      if (file.createdById && !isDirectionRole(req.user.roleKey)) {
        throw new ForbiddenException('Solo dirección puede eliminar archivos ya subidos');
      }
    } else {
      this.assertOrphanFileEdit(req.user);
    }

    /*
     * Borrado reversible. Antes esto hacía `unlinkSync` y borraba la fila:
     * irreversible, anónimo y sin auditoría — bastaba un clic para perder el
     * Excel de la corrida para siempre. Ahora el binario se queda en disco y
     * la fila conserva quién y cuándo.
     */
    const removed = await this.prisma.eventFile.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: req.user.id },
      include: { event: { select: { organizationId: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: removed.event?.organizationId,
        action: 'file.delete',
        resource: 'EventFile',
        resourceId: id,
        metaJson: { fileName: file.fileName, module: file.module, version: file.version },
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });

    void this.tellTeam(req.user, file.eventId, 'file.deleted', 'eliminó un archivo', file.fileName);
    return { ok: true, restorable: true };
  }

  /** Papelera: archivos borrados (soft-delete) de un evento. */
  @Get('event/:eventId/deleted')
  async listDeleted(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.assertEventOps(req.user, eventId);
    assertSameTenant(req.user, event.organizationId);
    return this.prisma.eventFile.findMany({
      where: { eventId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        url: true,
        kind: true,
        module: true,
        version: true,
        deletedAt: true,
        updatedAt: true,
        createdAt: true,
      },
    });
  }

  /** Deshacer el borrado. Existe porque ahora el binario no se destruye. */
  @Post(':id/restore')
  async restore(@Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> }, @Param('id') id: string) {
    const file = await this.prisma.eventFile.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    if (!file.deletedAt) return file;

    if (file.event) {
      if (
        !canAccessEventOps(
          req.user.entities as EntityKey[],
          req.user.roleKey as RoleKey,
          file.event.entity as EntityKey,
        )
      ) {
        throw new ForbiddenException();
      }
      assertSameTenant(req.user, file.event.organizationId);
      assertEventNotClosed(file.event.status);
      this.assertFileEditPermission(req.user, file.module);
    } else {
      this.assertOrphanFileEdit(req.user);
    }

    const restored = await this.prisma.eventFile.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      include: { event: { select: { organizationId: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: restored.event?.organizationId,
        action: 'file.restore',
        resource: 'EventFile',
        resourceId: id,
        metaJson: { fileName: file.fileName },
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });

    void this.tellTeam(req.user, file.eventId, 'file.restored', 'recuperó un archivo borrado', file.fileName);
    return restored;
  }
}
