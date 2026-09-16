# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-16
- **Rama:** main

## Hecho en este turno

**Correcciones de la junta del 11-09-2026** (PDF «Correciones Dashboard ARTA 11 de SEP 2026»).
Mandato de Adam: simple, elegante y visualmente atractivo; nada de texto de más.

### Lenguaje visual nuevo (compartido)
- `styles/_refine.scss` + `components/ui/Lite.tsx`: SectionHead, Seg (secciones con
  contador), Pill/ReviewPill/ReviewFlow, EmptyLite, Tile, FileRow; tablas `.dtable` con
  celdas editables sin borde, `.fx` para formularios, `.savebar`, Gantt `.timeline` y
  calendario mensual `.mcal`. Estilos por módulo: `_campaign`, `_po`, `_ticketing`, `_chat`.
- `lib/pdf-kit.ts`: helpers pdf-lib (logo repintado en tinta — el PNG es blanco).
- `lib/price-list.ts`: la lista de precios interno/externo del PDF (págs. 4-5).

### 1. Evento
- Alta y edición con el mismo formulario (`components/events/EventFields.tsx`): «Evento»
  fusiona artista + nombre, «Fecha del evento», horario (abre/cierra), funciones, último
  día si son varias, venue, ciudad, promotor, descripción. Sin campaña.
- Prisma `Event`: `description`, `schedule`, `functions`.
- Cabecera nueva (`EventHero`): fecha, horario, lugar, cuenta regresiva; cerrar/cancelar/
  eliminar en «Más». Resumen con 4 mosaicos que llevan a su pestaña.
- La página del evento ya no cablea estado de OC/campaña/boletera/corrida/convenios:
  cada panel es autónomo (`EventPanelProps`: event, closed, onChanged, flash).

### 2. Corrida
- Sin «Nueva hoja de corrida» ni edición en página: un solo Excel, se ve embebido, se
  descarga y se reemplaza con versión (`PUT /uploads/:id/content`).

### 3. Órdenes de compra (agente)
- Se crean cualquier día. La config `poWindow` ahora son **días de cobro** (default
  L-M-V, marcador `kind: 'payDays'`; la config vieja se ignora). Marcar pagada fuera de
  día de cobro → 403, salvo dirección.
- Secciones Por autorizar · Por pagar · Pagadas · Todas (evento y portafolio).
- Partidas Cantidad | Descripción | Precio | Total; precio vacío (sin «0»); autocompleta
  precio interno desde la lista. Proveedor/Otro (`payeeType`), IVA 16 % (`withIva`),
  forma de pago Efectivo/Transferencia/Cheque (enum `CHEQUE`), observaciones.
- PDF con el machote del cliente (`lib/po-pdf.ts`).

### 4. Campaña
- Conceptos con cantidad, fechas, precio interno y externo; «Desde lista de precios».
- Vista Calendario (Gantt con hoy y día del show). Portafolio `/campaigns` con lista y
  calendario mensual; vuelve al menú.
- Estados Borrador → En revisión → Autorizada → Pagada (`Campaign.status`, `submittedAt`,
  `paidAt`; `authorized` se deriva). `POST /campaigns/event/:id/status {status, scope}`.
- «Generar campaña» = archivo de campaña (Excel con hojas Interna y Externa, versionado).
- Dos PDFs independientes: interna y externa (`lib/campaign-pdf.ts`).
- `POST /campaigns/event/:id` ahora FUSIONA `dataJson` por llave (conceptos y convenios
  escriben en la misma campaña).

### 5. Convenios
- Tabla Convenio | Descripción | Zona | Cantidad | Precio | Total (zona sugiere las de la
  boletera y trae su precio). Revisión propia (`Campaign.convenioStatus`). «Generar
  campaña de convenios» (Excel `CONVENIOS-*.xlsx`) + PDF. Patrocinadores plegados abajo.

### 6. Boletera (agente)
- «Creación de boletera»: artes (link), fecha, funciones, horario, venue, descripción,
  zonas (zona/aforo/precio), hold artista/promotor/venue. «Crear boletera y PDF» genera el
  PDF como el ejemplo del cliente. Sin sync, logo ni vendidos. `/ticketing` vuelve al menú.

### 7. Edición (quién edita)
- Rol nuevo `solo_carpetas` (sin operación de eventos, sin permisos).
- Leida y Sol (Marisol) → `gerente_arta` solo ARTA; Williams y Juan Pablo → `solo_carpetas`.
- Base viva: `scripts/apply-access-junta-0911.ts` (`--dry` primero). El seed ya lo trae
  para instalaciones nuevas. Aplicado en la base local de Docker.

### 8. Chat interno (agente)
- `/chat`: canal General + mensajes personales, no leídos, polling 4 s/10 s.
  Prisma `ChatMessage`, `ChatReadMarker`. API `/chat/*`.

### Seeder de credenciales (pedido de Adam, 15-09)
- `apps/api/scripts/seed-credentials.ts`: contraseña aleatoria por persona del equipo
  oficial (`@artaproducciones.com` + Rodrigo; `--all` para todos, `--only=` para algunos),
  guarda solo el hash, deja auditoría y escribe el Excel (Nombre, Correo, Contraseña, Rol,
  Entidades, Puede editar, Acceso). No imprime contraseñas. Pide `--yes`; si la base no es
  local exige `--confirm-produccion`. `--revoke` cierra sesiones.
- `.gitignore`: `credenciales/` y `*credenciales*.xlsx` nunca entran al repo.
- Corrido SOLO en Docker local (9 personas); el Excel se entregó a Adam por el chat, no
  vive en el repo.
- ⚠️ La base local trae cuentas duplicadas de un seed viejo con dominio `@arta.mx`
  (Arturo, José Luis, Leida, Juan Pablo, Williams, Melissa) y roles antiguos: con
  `williams@arta.mx` / `jp@arta.mx` se sigue editando. No se tocaron. Revisar si existen en
  producción y desactivarlas desde Usuarios.

### Segunda vuelta: más intuitivo (revisión propia, 15-09)
- **Campaña → Orden de compra:** con la campaña autorizada o pagada, «Crear OC» abre
  Órdenes de compra con las partidas a precio interno, rubro «Publicidad / campaña».
  Traspaso por `sessionStorage` (`poHandoffKey` en `lib/draft-store.ts`).
- **Excel → tabla:** «Actualizar tabla desde Excel» en el archivo de campaña
  (`parseCampaignWorkbook`): lo editado en Excel vuelve a la tabla, PDFs y calendario.
- **Borradores que no se pierden:** Campaña y Convenios guardan lo tecleado sin guardar
  en `sessionStorage` al cambiar de pestaña o recargar.
- **Candado en API:** conceptos (o convenios) en revisión/autorizados no se editan por
  `POST /campaigns/event/:id` hasta regresarlos a borrador.
- **Avisos:** enviar a revisión → dirección + gerencia de esa entidad; autorizar /
  regresar / pagar → a quien la envió; OC nueva → quien la puede autorizar.
- **Chat:** contador de no leídos en el menú (`useChatUnread`, 30 s + evento
  `arta:chat-read`) e icono propio.
- **Permisos:** `solo_carpetas` ya no ve «Tareas» ni puede crear tareas.
- `docker-compose.yml`: `TZ=America/Mexico_City` en api y web.
- Pruebas nuevas: `campaigns.controller.spec.ts` (candado, fusión de convenios, avisos,
  quién autoriza).

### Tercera vuelta: menos fricción visual (15-09, tarde)
Adam: «aún siento mucha fricción visual en algunos módulos, medio sucios o poco intuitivos».
- **Inicio** (`dashboard/page.tsx`): saludo + 4 mosaicos clicables (próximos 14 días,
  por pagar, tareas, formatos por autorizar) + «Próximos shows» y «Requiere atención».
  Fuera: portfolio neto, gráficas, márgenes, cuellos de botella y bitácora (siguen en sus
  módulos).
- **Eventos** (`events/page.tsx`): una tarjeta por show (fecha apilada, lugar, avance,
  píldora solo si hay algo que atender) + Seg Actuales/Pasados/Todos + buscar + Crear.
  Fuera el tablero por estado y la tabla duplicada.
- **Carpetas** (`folders/page.tsx`): tarjetas de carpeta; al abrir, archivos como
  FileRow con Ver/Editar/Abrir. El alta de carpeta ya no está siempre desplegada.
- **Calendario** (`calendar/page.tsx`): el mismo `MonthCalendar` de Campañas.
- **Marco** (`AppShell`): pie del menú = persona + iconos (esconder menú, salir); fuera el
  texto de alcance del rol, el badge de entidad de la barra y la pista del auto-ocultar.
- **Formatos** (`EventChecklistsPanel`): lista con filtro (Todos / Por completar / En
  revisión / Listos) y, al abrir, cabecera compacta + secciones plegables con casillas
  grandes. Firmas, PDF, adjuntos e historial ya no son cuatro bloques siempre abiertos:
  salen de «Más» como cajón. Estilos en `styles/_hub.scss` (los dejó un agente que se
  colgó antes de escribir el panel; el selector `ChecklistPicker` también es suyo).
- **Documentos** (`EventFilesPanel`): una lista con filtro por sección; el editor o la
  vista previa se abren bajo el archivo, no en paneles apilados arriba. Fuera las cuatro
  tarjetas de creación con microcopy: subir, importar Word y «+ Documento» en la cabecera.
- **Tareas** (`EventTasksPanel` + `styles/_tasks.scss`): una línea para pedir algo,
  secciones Abiertas / Por aprobar / Hechas, y la fila se abre para responsable, fecha,
  entrega, aprobación e historial.
- `styles/_home.scss`: estilos de lo anterior + capa de limpieza para pantallas viejas
  (oculta pistas largas, pasos numerados y «Qué pasa después»; badges sin mayúsculas;
  paneles con el aire de `.surface`).

### Migración
- `20260915090000_junta_0911` (enum CHEQUE, columnas nuevas, chat, backfill de campañas
  autorizadas). Aplicada en Docker local.

### Verde
- `tsc --noEmit` web y api limpios · jest API **190/190** (antes 174).
- Docker local: db 5439, api 4100, web 3100 (3000/4000/5432 los usa NEXARA; 5433 un
  Postgres nativo). Override en el scratchpad de la sesión, no en el repo.

## A medias

1. **Sin revisión visual con sesión real**: el agente no teclea contraseñas; Adam entra en
   http://localhost:3100 y revisa. Los PDFs se probaron renderizando en Node (logo solo
   se ve en navegador).
2. Monse y Kika siguen en `logistica` (la lista del cliente no los menciona).
3. Reglas CSS viejas sin uso en `globals.scss`: `.po-card*`, `.po-next*`,
   `.po-form-section*`, `.po-proofs*`, `.ticket-card*`, `.ticket-form-section*`,
   `.ticket-zones*`, `.event-hint`, `.event-quick-actions`.
4. Pendientes previos que siguen: fórmulas al insertar filas en Excel embebido; backfill
   de avance de checklists; `TZ=America/Mexico_City` en el contenedor del API.

## Siguiente paso

1. Adam revisa en local y da visto bueno.
2. Producción: `prisma migrate deploy` y luego
   `npx ts-node --transpile-only scripts/apply-access-junta-0911.ts --dry` → sin `--dry`.
   Avisar a Williams y Juan Pablo que su acceso queda en carpetas.
3. Si en producción había ventana de OC guardada, revisar «Días de cobro» en Configuración.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña: no romper al tocar Excel.
