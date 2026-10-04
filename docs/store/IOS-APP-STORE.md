# App Store Connect — ARTA (`com.artaproducciones.ops`)

Equipo de Apple: **NEXARA** (`AHNW9K8745`). Mismo esquema que NEXARA: sin Mac, se compila y sube desde GitHub
Actions (`.github/workflows/ios-testflight.yml`). Lee primero la decisión de distribución en [`README.md`](README.md).

## 1. Identificadores (los crea el flujo, o a mano)

`scripts/asc_signing.py` (lo corre «iOS · TestFlight») registra `com.artaproducciones.ops` y
`com.artaproducciones.ops.NotificationService`, activa Push Notifications y Communication Notifications y crea
los perfiles. Si prefieres hacerlo a mano antes: developer.apple.com → Certificates, Identifiers & Profiles →
Identifiers → «+» → App IDs → App → esos dos bundle id con **Push Notifications** (la app también
**Communication Notifications**).

## 2. Crear la app (a mano, una vez)

App Store Connect → Apps → «+» → **Nueva app**:

| Campo | Valor |
| --- | --- |
| Plataforma | iOS |
| Nombre | **ARTA Producciones** (si está tomado: «ARTA Producciones Ops») |
| Idioma principal | Español (México) |
| Bundle ID | `com.artaproducciones.ops` (si aún no aparece, corre una vez el flujo de TestFlight o créalo como en §1) |
| SKU | `ARTA-OPS-IOS` |
| Acceso de usuarios | Acceso completo |

## 3. Secretos de GitHub (una vez)

```powershell
pwsh -File scripts\subir-secretos-ios.ps1
```

Reusa el certificado `.p12` y la llave `AuthKey_*.p8` de NEXARA (`C:\dev\secrets\nexara-ios`): mismo equipo de
Apple. La llave necesita rol **Admin** (o App Manager con acceso a Certificates, Identifiers & Profiles).

## 4. TestFlight

GitHub → Actions → **iOS · TestFlight** → Run workflow (rama `main`). El número de build es el número de
corrida; la versión sale de `MARKETING_VERSION` (`project.yml`). Al terminar, la build aparece en App Store
Connect → TestFlight en ~15 min.

- **Prueba interna**: usuarios de App Store Connect (hasta 100), sin revisión.
- **Prueba externa** (equipo de ARTA sin cuenta en ASC): grupo con enlace público; la primera build pasa por
  *Beta App Review* (1 día aprox.). Usa la misma información de revisión de §7.

## 5. Información de la app

| Campo | Valor |
| --- | --- |
| Subtítulo (≤30) | `Producción de eventos en equipo` |
| Categoría principal | Negocios |
| Categoría secundaria | Productividad |
| Derechos de contenido | No contiene contenido de terceros |
| URL del aviso de privacidad | https://artaproducciones.com/legal/privacidad |
| Copyright | `2026 NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.` |
| Precio | Gratis |
| Clasificación por edad | Contestar «No» a todo salvo **Mensajes y chat entre usuarios: Sí** (chat del equipo). No hay acceso web sin restricciones (la vista web solo abre el panel de ARTA). |
| Cifrado (exportación) | Solo HTTPS estándar → exenta; ya declarado `ITSAppUsesNonExemptEncryption = NO` |

## 6. Privacidad de la app («Etiqueta de privacidad»)

¿Recopilas datos? **Sí**. Para cada tipo: *vinculado a la identidad: Sí · rastreo: No · propósito: Funcionalidad de
la app*. Coincide con `apps/mobile-native/ios/Resources/PrivacyInfo.xcprivacy`.

| Categoría | Tipo |
| --- | --- |
| Información de contacto | Nombre, Correo electrónico |
| Contenido del usuario | Correos electrónicos o mensajes de texto (chat), Fotos o videos, Datos de audio (notas de voz), Otro contenido del usuario (documentos adjuntos) |
| Identificadores | ID de usuario, ID del dispositivo (token de notificaciones) |

**No** se recopila: ubicación, salud, finanzas, contactos, historial de navegación/búsqueda, compras, datos de
uso ni diagnósticos (no hay analítica ni reporte de fallos).

## 7. Versión 1.0.0

**Texto promocional** (≤170):
`La operación de tus eventos en el teléfono: tareas, chat del equipo, aprobaciones y anticipos, con la misma cuenta del panel de ARTA.`

**Descripción**
```
ARTA es la app de trabajo del equipo de Arta Producciones para producir eventos y espectáculos.

Con ARTA puedes:

• Ver y entregar tus tareas, con evidencia, y saber cuáles vencen hoy.
• Hablar con tu equipo en canales por evento, mensajes directos y grupos, con fotos, videos, notas de voz y documentos.
• Aprobar o rechazar tareas, órdenes de compra y anticipos desde el teléfono.
• Consultar los eventos del mes y el detalle de cada show.
• Recibir avisos al momento de lo que necesita tu atención.
• Abrir el resto del panel (formatos, campañas, corrida financiera, carpetas) sin volver a iniciar sesión.

Las cuentas las da de alta el administrador de Arta Producciones; cada persona ve lo que corresponde a su rol.

Aviso de privacidad: https://artaproducciones.com/legal/privacidad
```

**Palabras clave** (≤100): `eventos,producción,conciertos,tareas,chat,equipo,aprobaciones,anticipos,staff,logística`
**URL de soporte**: https://artaproducciones.com/legal/soporte · **URL de marketing**: https://artaproducciones.com

**Capturas** (solo iPhone, porque la app es solo iPhone): 6.9" (1320×2868) obligatorias, mínimo 3. Deben ser
de iPhone (NEXARA fue rechazada por subir capturas de Android). Hoy no hay flujo de capturas como el de NEXARA
(`ios-screenshots.yml` + UITests con modo demo); mientras, se toman en un iPhone Pro Max con la cuenta de revisión.
Sugeridas: Inicio · Tareas · Chat · Aprobaciones · Eventos.

**Información para la revisión**: inicio de sesión requerido → usuario y contraseña de
[`CUENTA-REVISION.md`](CUENTA-REVISION.md); contacto: Adam. Adjuntar la carta de autorización de Arta
Producciones (5.2.1). Notas (en inglés):

```
ARTA is the work app of Arta Producciones (event and concert production, Puebla, Mexico). It is developed and
published by NEXARA (NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.) for its client Arta
Producciones; the attached letter authorizes NEXARA to publish it with the ARTA name and logo.

There is no public sign-up: Arta Producciones' administrator creates accounts for its staff and vendors.

HOW TO REVIEW
Use the account in the Sign-in information fields. It belongs to an isolated demo organization
("ARTA Demo · Revisión de tiendas") with fictional events, tasks, approvals and chat; it cannot see real data
and does not require two-factor authentication.

WHAT TO TRY
Home (pending work) · Tasks (open a task, deliver it) · Chats (channels, direct messages, voice notes) ·
Notifications · More > Approvals (approve or reject a task, a purchase order or an expense advance) · Events.
"More" also opens the rest of the web panel inside the app with the same session.

PERMISSIONS
Camera, microphone and photo library are used only when the user attaches a photo, video, voice note or file
in chat or as task evidence. No location, no background access.

CHAT
Closed workplace chat between members of the same organization. Members are added by the administrator, who can
deactivate any account; inappropriate content can be reported to the administrator or to gerencia@nexara.com.mx.

ACCOUNT DELETION
More > "Eliminar mi cuenta" opens https://artaproducciones.com/legal/eliminar-cuenta (accounts are created by
the organization, there is no in-app sign-up).

EXTERNAL SERVICES
ARTA API (https://arta.artaproducciones.com), Firebase Cloud Messaging and Apple Push Notification service.
No advertising, no analytics, no tracking, no in-app purchases.
```

## 8. Distribución

Opción recomendada: **sin listar** (*Unlisted App Distribution*). Después de crear la app, llena el formulario
de Apple «Unlisted app distribution request» con el App ID y explica que es la app interna de producción de Arta
Producciones; al aprobarse, el envío a revisión publica la app solo por enlace.
