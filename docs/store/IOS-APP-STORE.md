# App Store Connect — ARTA (`com.artaproducciones.ops`)

Equipo de Apple: **NEXARA** (`AHNW9K8745`). Mismo esquema que NEXARA: sin Mac, se compila y sube desde GitHub
Actions (`.github/workflows/ios-testflight.yml`). Lee primero la decisión de distribución en [`README.md`](README.md).

**Estado al 04-10-2026.** Ya están hechos los §1, §2, §5 y §6, y la versión 1.0.0 del §7 (sin capturas):
App IDs `com.artaproducciones.ops` (Push + Communication Notifications) y `.NotificationService` (Push)
registrados; app **ARTA Producciones** creada en App Store Connect (id `6819117925`, es-MX, SKU `ARTA-OPS-IOS`,
acceso completo). Información de la app, categorías, derechos de contenido, clasificación por edad (igual que
NEXARA: chat y contenido de usuarios Sí, lo demás No), precio gratis (base México), disponible en los 175
países, etiqueta de privacidad publicada (8 tipos, vinculados, sin rastreo), descripción, palabras clave, URLs,
copyright, información de revisión (contacto igual que NEXARA, usuario demo y notas) e información de prueba de
TestFlight. Faltan: la **contraseña** de la cuenta de revisión en «Información de la revisión» y en TestFlight →
«Información de prueba» (la escribe Adam; está en `C:\dev\secrets\arta-store\cuenta-revision.txt`), los
secretos (§3), la primera build (§4), capturas, la carta de Arta (5.2.1) y, si se decide, la solicitud de
distribución sin listar (§8). La app con id `6814597698` es la de **NEXARA**: no tocarla.

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
| Subtítulo (≤30) | `Operación de eventos en equipo` (el anterior, «Producción de eventos en equipo», tiene 31 y Apple lo rechaza) |
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
`La operación de tus eventos en el teléfono: tareas, chat por evento, aprobaciones y anticipos. Pruébala sin cuenta con el modo de muestra.`

**Descripción**
```
ARTA es la plataforma de operación de eventos en vivo para productoras y recintos: cada organización tiene su propio espacio aislado y su equipo lo usa desde el teléfono con la misma cuenta del panel web.

Con ARTA tu equipo puede:

• Ver y entregar sus tareas, con evidencia, y saber cuáles vencen hoy.
• Hablar por canales de cada evento, mensajes directos y grupos, con fotos, videos, notas de voz y documentos.
• Aprobar o rechazar tareas, órdenes de compra y anticipos desde el teléfono.
• Consultar los eventos del mes y la ficha de cada show.
• Recibir avisos al momento de lo que necesita su atención.
• Abrir el resto del panel (formatos, campañas, corrida financiera, carpetas) sin volver a iniciar sesión.

¿Tu productora o recinto aún no usa ARTA? Solicita tu espacio en artaproducciones.com/contratar. ¿Quieres verla antes? Abre la app y toca «Explorar ARTA con datos de muestra»: recorres todas las funciones sin cuenta ni conexión.

Cada organización da de alta a las personas de su equipo y decide qué ve cada una. La app no tiene compras ni suscripciones.

Aviso de privacidad: https://artaproducciones.com/legal/privacidad
```

**Palabras clave** (≤100): `eventos,producción,conciertos,tareas,chat,equipo,aprobaciones,anticipos,staff,logística`
**URL de soporte**: https://artaproducciones.com/legal/soporte · **URL de marketing**: https://artaproducciones.com/contratar

**Capturas** (solo iPhone, porque la app es solo iPhone): 6.9" (1320×2868) obligatorias, mínimo 3. Deben ser
de iPhone (NEXARA fue rechazada por subir capturas de Android). Hoy no hay flujo de capturas como el de NEXARA
(`ios-screenshots.yml` + UITests con modo demo); mientras, se toman en un iPhone Pro Max con la cuenta de revisión.
Sugeridas: Inicio · Tareas · Chat · Aprobaciones · Eventos.

**Información para la revisión**: inicio de sesión requerido → usuario y contraseña de
[`CUENTA-REVISION.md`](CUENTA-REVISION.md); contacto: Adam. Adjuntar la carta de autorización de Arta
Producciones (5.2.1). Notas (en inglés):

```
ARTA is a workspace platform for live-event production companies and venues in Mexico: tasks with evidence,
team chat per event, approval of tasks, purchase orders and cash advances, event calendar and production forms.
Each customer organization gets an isolated workspace; its administrators create the accounts for their staff
and vendors. Any production company or venue can contract its own workspace at
https://artaproducciones.com/contratar (NEXARA contact: https://nexara.com.mx/contacto). The platform is
developed, operated and published by NEXARA (NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.);
Arta Producciones S.A. de C.V. (Puebla) is the launch customer and lends its name to the platform (signed
authorization letter in our App Review reply of October 8, 2026).

HOW TO REVIEW WITHOUT AN ACCOUNT
On the sign-in screen tap "Explorar ARTA con datos de muestra" (Explore ARTA with sample data). Demo mode needs
no account and no network: it opens the full app (Inicio, Chats, Tareas, Avisos, Más, approvals, events) with
fictional data from a sample production company and shows a "Modo demostración" pill with "Salir" (exit).
Sections of "Más" that open the web panel show an explanatory notice in demo mode.

DEMO ACCOUNT (real backend)
The account in Sign-in Information belongs to an isolated demo organization ("ARTA Demo · Revisión de
tiendas") with fictional data only; no two-factor authentication.

WHAT TO TRY
Inicio (pending work, Aprobaciones: approve or reject a task, a purchase order or a cash advance) · Tareas (open
a task, deliver it) · Chats (channels, direct messages, voice notes; long-press a message to report it or block
its author; Más > Usuarios bloqueados to unblock) · Avisos · Más (web panel modules, legal pages, "Eliminar mi
cuenta", "Cerrar sesión").

PERMISSIONS
Camera, microphone and photo library are used only when the user attaches a photo, video, voice note or file
in chat or as task evidence. No location; the only background mode is remote notifications.

USER-GENERATED CONTENT (1.2)
Closed workplace chat between members of the same organization. Users can report any message and block any
person; reports reach the organization's administrators, who act within 24 hours and can delete content and
deactivate accounts. Terms of use: https://artaproducciones.com/legal/terminos.

ACCOUNT DELETION (5.1.1)
Más > "Eliminar mi cuenta" opens https://artaproducciones.com/legal/eliminar-cuenta.

BUSINESS MODEL (3.2)
No paid content, no in-app purchases, no subscriptions. Organizations pay NEXARA for the service outside the
app; users pay nothing.

EXTERNAL SERVICES
ARTA API (https://arta.artaproducciones.com), Firebase Cloud Messaging and Apple Push Notification service.
No advertising, no analytics, no tracking.
```

## 8. Distribución

**Decisión de Adam (05-10 y 19-10-2026): tienda abierta**, presentada como plataforma para productoras y
recintos (modo demo en la build de tienda, página pública `/contratar`, textos de plataforma). El rechazo 3.2
del 12-10 y la respuesta están en [`RESPUESTA-APPLE-3.2.md`](RESPUESTA-APPLE-3.2.md). Plan B si Apple insiste:
**sin listar** (*Unlisted App Distribution*): formulario de Apple «Unlisted app distribution request» con el
App ID `6819117925`; al aprobarse, la app se instala solo por enlace.
