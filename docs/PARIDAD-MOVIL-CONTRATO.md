# Paridad web ↔ app — contrato compartido (2026-10-04)

Decisión de Adam: **híbrido**. Lo diario es nativo (Chat, Avisos, Inicio, Tareas, Eventos/Calendario,
Aprobaciones). Todo lo demás se abre **dentro de la app** en una vista web con la misma sesión, y la web
tiene un «modo app» limpio para teléfono. Así hay paridad total: todo lo que existe en la web está en la app.

## 1. Pestañas (Android e iOS, mismo orden)

`Inicio` · `Chats` · `Tareas` · `Avisos` · `Más`

- **Inicio**: saludo, mis tareas de hoy/vencidas, aprobaciones pendientes (si mi rol aprueba),
  próximos eventos (7 días), accesos rápidos. Tirar para actualizar.
- **Más**: perfil arriba, lista de **todos** los módulos de la web que mi rol puede ver (mismo menú que la
  barra lateral web, mismos permisos), cada uno abre la vista web; abajo Ajustes de avisos, No molestar,
  Abrir en el navegador, Cerrar sesión, versión.

## 2. Rutas nativas

| Ruta | Android (NavHost) | iOS (`AppRoute`) |
|---|---|---|
| Tarea | `task/{id}` | `.task(id)` |
| Evento | `event/{id}` | `.event(id)` |
| Aprobaciones | `approvals` | `.approvals` |
| Vista web | `web?path={path}&title={title}` | `.web(path:title:)` |
| Chat | `chat/{channelId}?msg={msg}` (ya existe) | `.chat(channelId:messageId:)` |

### Android — paquete `com.artaproducciones.ops.ui.modules`

`ui/modules/ModuleNav.kt` (lo crea el agente de módulos):

```kotlin
interface ModuleNav {
    fun openTask(id: String)
    fun openEvent(id: String)
    fun openApprovals()
    fun openWeb(path: String, title: String? = null)
    fun openChat(channelId: String)
    fun back()
}
```

Pantallas (agente de módulos): `InicioScreen(user: UserDto, nav: ModuleNav)`, `TasksScreen(nav)`,
`TaskDetailScreen(taskId: String, nav)`, `ApprovalsScreen(nav)`, `EventsScreen(nav)` (lista + mes),
`EventDetailScreen(eventId: String, nav)`. El agente del cascarón implementa `ModuleNav` y las conecta.
Llamadas HTTP de módulos en `data/api/ArtaModulesApi.kt` (Retrofit aparte, mismo `OkHttpClient` de `ApiClient`).

### iOS — `Navigation/AppRoute.swift` (lo crea el agente del cascarón)

```swift
enum AppRoute: Hashable {
    case task(String)
    case event(String)
    case approvals
    case web(path: String, title: String?)
    case chat(channelId: String, messageId: String?)
}
// AppRouter (EnvironmentObject) expone: func open(_ route: AppRoute)
```

Vistas (agente de módulos): `InicioView(user: UserDto)`, `TasksView()`, `TaskDetailView(taskId: String)`,
`ApprovalsView()`, `EventsView()`, `EventDetailView(eventId: String)`; navegan con `router.open(...)`.
Llamadas HTTP en `Data/ApiClient+Modules.swift` (extensión) y modelos en `Data/ModulesModels.swift`.

## 3. Vista web dentro de la app

- Android `WebView` / iOS `WKWebView` con la cookie de sesión copiada del almacén nativo
  (`PersistentCookieJar` → `CookieManager`; `HTTPCookieStorage` → `WKHTTPCookieStore`) **antes** de cargar.
- User-Agent = el de la app (`ArtaApp/<versión> (...)`) + el del sistema, para que la web active el modo app.
- La web en modo app **no** muestra barra lateral ni barra superior propia (la pone la app), respeta
  `env(safe-area-inset-*)` y todo cabe en 390 px.
- Enlaces internos que tienen pantalla nativa (`/tasks…`, `/events/<id>`, `/chat…`) salen de la vista web
  y abren la nativa; enlaces externos abren el navegador del sistema; descargas/PDF se abren con el visor
  del sistema; subir archivos funciona (selector de archivos y cámara).
- Si la web responde 401 o manda a `/login`, la app cierra sesión nativa (una sola sesión).

## 4. Enlace de cada aviso (push y campana)

El API manda siempre `url` = ruta interna del panel (`linkUrl` de `NotificationsService.notify`). La app decide:

| `url` | Abre |
|---|---|
| `/chat?channel=<id>&msg=<id>` | conversación nativa |
| `/tasks?task=<id>` · `/tasks/<id>` · `/events/<eid>?tab=tasks&task=<id>` | tarea nativa |
| `/events/<id>` (con o sin `?tab=`) | evento nativo (si `tab` no tiene versión nativa, vista web) |
| `/advances…` · `/purchase-orders…` con acción pendiente | aprobaciones nativas |
| cualquier otra | vista web en esa ruta |

Canales Android / categorías iOS por `channel` del push (`notification-push-meta.ts`):
`chat`, `tareas`, `aprobaciones`, `eventos`, `documentos`, `general`. Cada aviso agrupa por entidad (`tag`).

## 5. Reglas de UI (nativo)

- Tema oscuro actual con acento dorado (`ArtaColors` / `ArtaColor`), escala de espacios 4/8/12/16/24.
- Cada pantalla con: esqueleto al cargar, vacío con texto útil, error con «Reintentar», tirar para actualizar.
- Textos en español de México. Fechas relativas («hoy 16:00», «mañana», «vence en 2 días»).
- Hápticos en acciones principales. Confirmación antes de rechazar o borrar.
