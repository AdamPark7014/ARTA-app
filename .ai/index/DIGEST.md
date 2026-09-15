# Digest local — 120 archivos
Generado 2026-09-09T15:35:02.773Z por qwen2.5-coder:7b (worker local, 0 tokens de frontier)

**Cobertura parcial: 120 de 308 archivos** (muestra repartida por carpeta). Lo que no esté aquí no significa que no exista — sube `--max` para indexar más.

| Archivo | Para qué sirve | Exporta |
|---------|----------------|---------|
| `apps/api/prisma/migrations/20260710001454_init/migration.sql` | Define tablas y tipos de datos para una aplicación de gestión de eventos y compras. | User, Event, ChecklistTemplate, ChecklistInstance |
| `apps/api/prisma/migrations/20260722042627_org_2fa_jobs_outbox/migration.sql` | Migración para añadir organizaciones, roles y autenticación 2FA | OrgPlan |
| `apps/api/prisma/migrations/20260828120000_tasks_org_notifications_file_module/migration.sql` | Migración para mejorar la gestión de archivos, tareas y notificaciones en la plataforma. | EventFile, TaskAssignment, Notification |
| `apps/api/prisma/migrations/20260903040829_doc_revisions_and_status/migration.sql` | Migración de datos para añadir campos y tipos de documentos | DocStatus, DocType |
| `apps/api/prisma/schema.prisma` | Definición de esquema de Prisma para la base de datos de ARTA | Organization, OrgInvite, OrgMembership, User |
| `apps/api/prisma/seed.ts` | Script para sembrar datos iniciales en la base de datos usando Prisma Client | ensureSeedAsset, SEED_SLIDES, SEED_NEWS, section |
| `apps/api/scripts/backfill-checklist-pdf-fields.ts` | Rellena el mapa de campos del PDF de los checklists que ya existían. |  |
| `apps/api/scripts/provision-new-users.ts` | Script para crear nuevos usuarios en la base de datos sin modificar a los existentes. |  |
| `apps/api/src/analytics/analytics.controller.ts` | Controlador de análisis con endpoints para obtener datos de diferentes tipos de análisis. | AnalyticsController |
| `apps/api/src/analytics/analytics.service.ts` | Servicio de análisis para eventos, checklists, pedidos de compra, tareas y ejecuciones financieras. | AnalyticsService |
| `apps/api/src/app.module.ts` | {
  "purpose": "Define el módulo principal de la aplicación NestJS",
  "exports": [],
  "deps": ["@nestjs/common", "@nes |  |
| `apps/api/src/auth/auth.controller.ts` | Controlador de autenticación para manejar operaciones como inicio de sesión, verificación de 2FA, habilitación y deshabilitación de 2FA, cierre de sesión, información del usuario, creación y consumo de handoffs, y gestión de sesiones. | AuthController |
| `apps/api/src/auth/auth.service.ts` | Servicio de autenticación para la aplicación | AuthService |
| `apps/api/src/automations/automations.service.ts` | Servicio de automatizaciones para escaneos periódicos y evaluaciones de riesgo. | AutomationsService |
| `apps/api/src/billing/billing.service.ts` | Servicio de facturación para gestionar planes y sesiones de pago | BillingService |
| `apps/api/src/billing/billing.webhook.spec.ts` | Pruebas unitarias para el servicio de facturación |  |
| `apps/api/src/campaigns/campaigns.controller.ts` | Controlador para gestionar campañas | CampaignsController |
| `apps/api/src/checklists/checklist-pdf.service.ts` | Genera PDFs de checklists con firmas y datos | ChecklistPdfService |
| `apps/api/src/checklists/checklists.controller.ts` | Controlador para manejar checklists | ChecklistsController |
| `apps/api/src/common/checklist-progress.spec.ts` | Pruebas unitarias para funciones de progreso de checklist | FIRMAS_SECTION |
| `apps/api/src/common/doc-diff.spec.ts` | Pruebas unitarias para funciones de diferencia de documentos | diffChecklistData, diffFinanceRows |
| `apps/api/src/common/doc-diff.ts` | Funciones para comparar documentos y generar diferencias legibles. | ChangeKind, FieldChange, DocDiff, EMPTY_DIFF |
| `apps/api/src/common/doc-guards.spec.ts` | Pruebas unitarias para las funciones de control de acceso y transición de documentos | docWriteBlock, assertDocWritable, assertTransitionAllowed, assertCanTransition |
| `apps/api/src/common/doc-guards.ts` | Define funciones para controlar la escritura y transición de documentos en un sistema de gestión de eventos. | WritableDoc, DocEvent, WriteBlock, APPROVER_ROLES |
| `apps/api/src/common/rbac/roles.spec.ts` | Pruebas unitarias para el módulo de control de acceso basado en roles (RBAC) en la aplicación de API. | hasPermission, canAccessEntity, canAccessEventOps, eventOpsEntities |
| `apps/api/src/common/rbac/roles.ts` | Define roles, permissions, and labels for the ARTA platform. | ROLES, RoleKey, ALL_ROLES, EntityKey |
| `apps/api/src/common/revisions/revision.service.ts` | Servicio para gestionar las revisiones de documentos | RevisionService, RevisionConflictException, actorFrom |
| `apps/api/src/common/tenant.spec.ts` | Pruebas unitarias para funciones de gestión de inquilinos en una aplicación NestJS | tenantIdOf, assertSameTenant, orgWhere, assertTenantAdminAccess |
| `apps/api/src/common/url-safety.ts` | Valida URLs públicas HTTP/HTTPS, bloqueando direcciones IP y nombres de host privados. | assertPublicHttpUrl |
| `apps/api/src/digests/digests.service.ts` | Servicio para generar resúmenes diarios de operaciones y enviar notificaciones a los directivos. | DigestsService |
| `apps/api/src/documents/document-pdf.service.ts` | Genera PDFs a partir de bloques de texto normalizados. | DocumentPdfService |
| `apps/api/src/documents/documents.controller.ts` | {
  "purpose": "Controlador para gestionar documentos en eventos",
  "exports": ["DocumentsController"],
  "deps": ["@ne |  |
| `apps/api/src/events/events.controller.ts` | Controlador para gestionar eventos | EventsController |
| `apps/api/src/finance/finance-extract.service.spec.ts` | Pruebas unitarias para el servicio FinanceExtractService que extrae renglones de un libro de Excel. |  |
| `apps/api/src/finance/finance-extract.service.ts` | Servicio para extraer renglones financieros de un archivo Excel y sincronizarlos con la base de datos. | FinanceExtractService |
| `apps/api/src/finance/finance-totals.spec.ts` | Pruebas unitarias para funciones financieras | financeTotals, safeAmount, withServerTotals |
| `apps/api/src/finance/finance.controller.ts` | Controlador para finanzas, incluye endpoints para listar finanzas y crear avances. | FinanceController |
| `apps/api/src/folders/folders.controller.ts` | Controlador para gestionar carpetas y archivos | FoldersController |
| `apps/api/src/jobs/jobs.service.ts` | Servicio de trabajos periódicos en NestJS | JobsService |
| `apps/api/src/main.ts` | Aplicación principal de NestJS para el API de ARTA |  |
| `apps/api/src/organizations/org-invites.controller.ts` | Controlador para gestionar invitaciones a organizaciones | OrgInvitesController |
| `apps/api/src/organizations/organizations.controller.ts` | Controlador para gestionar organizaciones | OrganizationsController |
| `apps/api/src/purchase-orders/po-window.spec.ts` | Pruebas unitarias para la ventana de órdenes de compra | DEFAULT_PO_WINDOW, describeSchedule, evaluatePoWindow, formatHhMm |
| `apps/api/src/purchase-orders/po-window.ts` | Define la configuración y funciones para la ventana de solicitudes de órdenes de compra. | PoWindowConfig, DEFAULT_PO_WINDOW, DAY_NAMES, clampMinutes |
| `apps/api/src/purchase-orders/purchase-orders.audit.spec.ts` | Pruebas unitarias para el controlador de órdenes de compra, enfocándose en la regla del comprobante y la auditoría. | PurchaseOrdersController |
| `apps/api/src/purchase-orders/purchase-orders.controller.ts` | Controlador para gestionar órdenes de compra | PurchaseOrdersController |
| `apps/api/src/sponsors/sponsors.controller.ts` | Controlador para gestionar patrocinadores de eventos | SponsorsController |
| `apps/api/src/studio/studio.controller.ts` | Controlador para gestionar contenido en el estudio | StudioController |
| `apps/api/src/tasks/tasks.controller.ts` | Controlador de tareas para la API | TasksController |
| `apps/api/src/ticketing/providers/arema.provider.ts` | Proporciona proveedores de ticketing para diferentes modos de operación. | ZoneSold, TicketingProvider, LiveHttpTicketingProvider, AremaStubProvider |
| `apps/api/src/ticketing/ticketing-sync.service.ts` | Servicio para sincronizar entradas de boletos desde un proveedor externo. | TicketingSyncService |
| `apps/api/src/ticketing/ticketing.controller.ts` | Controlador para gestionar configuraciones de boletos | TicketingController |
| `apps/api/src/users/users.controller.ts` | Controlador para gestionar usuarios en la API | UsersController |
| `apps/api/src/webhooks/webhooks.service.ts` | Servicio para manejar webhooks en una aplicación NestJS | WebhooksService |
| `apps/api/test/auth-2fa-enforcement.e2e-spec.ts` | Prueba end-to-end de la implementación de la fuerza bruta de dos factores (2FA) en una organización |  |
| `apps/api/test/doc-status-flow.e2e-spec.ts` | E2E tests for document status flow in a checklist system. |  |
| `apps/api/test/purchase-orders-authz.e2e-spec.ts` | Prueba de autorización de pedidos de compra en un controlador de API usando Prisma y Jest. | PurchaseOrdersController |
| `apps/api/test/revision-concurrency.e2e-spec.ts` | Prueba de concurrencia en la edición de formatos de revisión |  |
| `apps/api/test/tenant-isolation.e2e-spec.ts` | Prueba de aislamiento de inquilinos multi-org end-to-end contra una base de datos Postgres real |  |
| `apps/web/app/(app)/advances/page.tsx` | Componente de React para la página de anticipos | AdvancesPage |
| `apps/web/app/(app)/audit/page.tsx` | Componente de página de auditoría que muestra métricas y logs de acciones realizadas. | AuditPage |
| `apps/web/app/(app)/calendar/page.tsx` | Componente de calendario de eventos para una aplicación web | EventsCalendarPage |
| `apps/web/app/(app)/campaigns/page.tsx` | Componente de página para gestionar campañas | CampaignsPage |
| `apps/web/app/(app)/checklists/page.tsx` | Página de gestión de plantillas de checklists | ChecklistsTemplatesPage |
| `apps/web/app/(app)/dashboard/page.tsx` | Componente de la página de resumen del centro de comando. | DashboardPage |
| `apps/web/app/(app)/digests/page.tsx` | Muestra resúmenes diarios y outbox de correos electrónicos | DigestsPage |
| `apps/web/app/(app)/events/[id]/page.tsx` | {
  "purpose": "Componente de página para mostrar detalles de un evento",
  "exports": ["EventDetailPage"],
  "deps": [" |  |
| `apps/web/app/(app)/events/page.tsx` | Muestra una lista de eventos con filtros y estadísticas. | EventsPage |
| `apps/web/app/(app)/finance/page.tsx` | Componente de página de finanzas que muestra resúmenes y detalles de corridas financieras. | FinancePage |
| `apps/web/app/(app)/folders/page.tsx` | Componente de React para gestionar carpetas y archivos en una aplicación web. | FoldersPage |
| `apps/web/app/(app)/maintenance/page.tsx` | Muestra la página de mantenimiento para eventos de renta en Explanada. | MaintenancePage |
| `apps/web/app/(app)/organizations/page.tsx` | Página de organizaciones con gestión de miembros e invitaciones | OrganizationsPage |
| `apps/web/app/(app)/purchase-orders/page.tsx` | Componente de página para gestionar órdenes de compra | PurchaseOrdersPage |
| `apps/web/app/(app)/risk/page.tsx` | Componente de página para el espacio de riesgo operativo | RiskWorkspacePage |
| `apps/web/app/(app)/security/page.tsx` | Muestra la página de seguridad de la aplicación, incluyendo sesiones activas, autenticación en dos pasos y opciones para revocar sesiones. | SecurityPage |
| `apps/web/app/(app)/settings/page.tsx` | Componente de configuración operativa de la organización, incluyendo la ventana de solicitud de órdenes de compra. | SettingsPage |
| `apps/web/app/(app)/studio/page.tsx` | Página de edición de contenido en el estudio de la aplicación | StudioPage |
| `apps/web/app/(app)/tasks/page.tsx` | Componente de página para gestionar tareas | TasksPage |
| `apps/web/app/(app)/ticketing/page.tsx` | Página de gestión de boletos con funcionalidades de edición y visualización de estadísticas. | TicketingPage |
| `apps/web/app/(app)/users/page.tsx` | Página de gestión de usuarios con filtros, formularios y estadísticas. | UsersPage |
| `apps/web/app/(app)/webhooks/page.tsx` | Componente React para gestionar webhooks | WebhooksPage |
| `apps/web/app/(auth)/invite/[token]/page.tsx` | Manejo de la aceptación de invitaciones de usuario | AcceptInvitePage |
| `apps/web/app/(auth)/login/page.tsx` | Componente de formulario de inicio de sesión para aplicaciones web. | LoginForm |
| `apps/web/app/v/[pinId]/page.tsx` | Manejo de sesión y acceso al portal del proveedor | VendorPortalPage |
| `apps/web/components/app-shell/AppShell.tsx` | Componente de shell para la aplicación web | AppShell |
| `apps/web/components/app-shell/NotificationBell.tsx` | Componente de reloj digital que muestra la hora actual y permite al usuario configurar la alarma. | Clock |
| `apps/web/components/checklists/TemplateSchemaEditor.tsx` | Editor de esquemas de plantillas para PDFs | TemplateSchemaEditor |
| `apps/web/components/events/event-detail.types.ts` | Define tipos de datos para eventos y sus componentes en una aplicación web. | SigPayload, ChecklistVersion, DocStatus, Checklist |
| `apps/web/components/events/EventCampaignPanel.tsx` | Panel de campaña para eventos | EventCampaignPanel |
| `apps/web/components/events/EventChecklistsPanel.tsx` | Panel de checklist de eventos con funcionalidades de edición, visualización y gestión de estados. | EventChecklistsPanel |
| `apps/web/components/events/EventFilesPanel.tsx` | Panel de archivos de eventos con edición y visualización | EventFilesPanel |
| `apps/web/components/events/EventFinancePanel.tsx` | Panel de finanzas para eventos, permite gestionar archivos Excel y PDF. | EventFinancePanel |
| `apps/web/components/events/EventOverviewPanel.tsx` | Componente de panel de vista previa de eventos | EventOverviewPanel |
| `apps/web/components/events/EventPurchaseOrdersPanel.tsx` | Panel de órdenes de compra para eventos | EventPurchaseOrdersPanel |
| `apps/web/components/events/EventSponsorsPanel.tsx` | Panel de patrocinadores para eventos | EventSponsorsPanel |
| `apps/web/components/events/EventTasksPanel.tsx` | Panel de tareas para eventos, con funcionalidades de creación, asignación, aprobación y seguimiento. | EventTasksPanel |
| `apps/web/components/events/EventTicketingPanel.tsx` | Panel de configuración de boletos para eventos | EventTicketingPanel |
| `apps/web/components/files/ChecklistPdfEditor.tsx` | Editor de PDF editable para listas de verificación. | ChecklistPdfEditor |
| `apps/web/components/files/DocEditor.tsx` | Editor de documentos tipo Word con bloques de texto | DocEditor |
| `apps/web/components/files/FileViewer.tsx` | Componente para visualizar archivos PDF, Excel y imágenes. | FileViewer |
| `apps/web/components/files/PdfEditor.tsx` | Componente para editar PDFs con texto impreso. | PdfEditor |
| `apps/web/components/files/SectionFileCreate.tsx` | Componente para crear/subir archivos en secciones del evento. | SectionFileCreate |
| `apps/web/components/files/SheetEditor.tsx` | Componente de edición de hojas de cálculo dentro de un panel. | SheetEditor, CellChange |
| `apps/web/components/ops/ModuleChecklistIndex.tsx` | Componente de React para mostrar un índice de checklists operativas. | ModuleChecklistIndex |
| `apps/web/components/site/PublicSiteContent.tsx` | Componente React para el contenido público del sitio web. | PublicSiteContent |
| `apps/web/components/ticketing/TicketZonesEditor.tsx` | Editor de zonas de boletos con funcionalidades de edición, eliminación y movimiento de zonas. | TicketZonesEditor |
| `apps/web/e2e/checklist-pdf.spec.ts` | Escribir sobre el PDF del checklist usando Playwright | openChecklist |
| `apps/web/e2e/editors.spec.ts` | Pruebas end-to-end para editores embebidos en aplicaciones web. | demoWorkbook |
| `apps/web/e2e/event-edit.spec.ts` | Pruebas end-to-end para la edición de eventos en la aplicación web. | EVENT |
| `apps/web/e2e/hub-critical.spec.ts` | Pruebas end-to-end para el Hub crítico de la aplicación web | demoWorkbook |
| `apps/web/e2e/support/mock-api.ts` | Doble de la capa `/api/*` para pruebas e2e del web. | TEST_USER, TEST_DIRECTORY, TEST_EVENTS, TEST_OVERVIEW |
| `apps/web/lib/access-matrix.ts` | Define la matriz de acceso para el panel de navegación y puertas de acceso UI. | EntityKey, RoleKey, NavItem, HIDDEN_NAV_GROUP |
| `apps/web/lib/campaign-concepts.ts` | Definición de tipos y datos para gestión de campañas | CampaignSheetMeta, CampaignConceptPrice, CAMPAIGN_CONCEPT_CATALOG, CampaignConceptPageRow |
| `apps/web/lib/campaign-sheet-template.ts` | Construye un .xlsx para editar en SheetEditor con datos de campaña de publicidad y convenios. | buildCampaignExpensesWorkbook |
| `apps/web/lib/finance-sheet-template.ts` | Genera un libro de hojas de cálculo financieras para una corrida. | FinanceSheetMeta, buildFinanceCorridaWorkbook, financeCorridaFileName |
| `apps/web/lib/site-seo.ts` | Define metadatos y funciones para SEO de la aplicación web. | SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, SITE_KEYWORDS |
| `apps/web/lib/sponsor-convenio-template.ts` | Genera hojas de cálculo para convenios de patrocinio y portafolios de patrocinios. | buildSponsorConvenioWorkbook, buildSponsorsPortfolioWorkbook |
| `apps/web/lib/user-context.tsx` | Manejo de contexto de usuario en una aplicación web | UserProvider |
| `docs/guides/_patch_csp.py` | Modifica el archivo arta-main.js para cambiar la política de seguridad de contenido |  |
| `packages/rbac/src/roles.ts` | Definición de roles y permisos para el sistema ARTA. | ROLES, RoleKey, ALL_ROLES, EntityKey |
