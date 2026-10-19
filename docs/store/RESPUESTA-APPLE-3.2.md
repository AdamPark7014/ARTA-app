# Respuesta a App Review — Guideline 3.2 (Business), 12-10-2026

Apple rechazó la **1.0.0 (11)** (envío `c1da1a8a-b1a8-4ed7-878a-fe4cb98c8385`, revisado en iPad Air 11" M3) con
**3.2 Business – Other Business Model Issues**: «la app está pensada para una empresa u organización concreta
(socios, clientes o empleados) pero se eligió distribución pública». Pide elegir otra vía de distribución o, si
creemos que es para el público general, contestar cinco preguntas:

1. ¿Está restringida a una sola empresa u organización (incluidos socios, empleados y contratistas)?
2. ¿Está diseñada para un grupo limitado de empresas? ¿Cuáles? Si no, ¿cualquier empresa puede ser cliente?
3. ¿Qué funciones son para el público general (descubrir, descargar y usar sin invitación ni afiliación)?
4. ¿Cómo obtienen cuenta los usuarios?
5. ¿Hay contenido de pago y quién lo paga?

## Decisión de Adam (19-10-2026): se queda pública, como plataforma

Se descartó la distribución sin listar. Para sostener «público general» con la verdad, el producto cambió
(commit `34c9258` y siguientes), no solo el texto:

| Cambio | Dónde | Para qué pregunta |
|---|---|---|
| **Modo demo en la build de tienda**: botón «Explorar ARTA con datos de muestra» en la entrada, sin cuenta ni red, pastilla «Modo demostración · Salir», secciones web con aviso | iOS `Demo/DemoMode.swift`, `Session.enterDemo`, `LoginView`, `HomeView`, `Demo/DemoBanner.swift`; `project.yml` ya no excluye `fixtures/` en Release | 3 |
| **Página pública de contratación** `https://artaproducciones.com/contratar` (qué incluye, cómo empezar, contacto de NEXARA), enlazada desde la entrada de la app y las páginas legales | `apps/web/app/contratar/page.tsx`, `lib/domains.ts` (ruta pública), `legal/layout.tsx` | 2, 4 |
| Textos de **plataforma**: soporte, términos, privacidad y eliminar cuenta hablan de «tu organización» / «las organizaciones que contratan el servicio», con Arta Producciones como primera | `apps/web/app/legal/*` | 1, 2 |
| Ficha de ASC reescrita (descripción, promo, URL de marketing → `/contratar`, notas de revisión) | `IOS-APP-STORE.md` §7 | 1–5 |

Lo que sigue siendo verdad y se dice tal cual: hoy la usan Arta Producciones y el recinto que opera (Auditorio
Explanada Puebla) como dos unidades de negocio; las cuentas las crean los administradores de cada organización;
no hay contenido de pago. El riesgo que queda: Apple puede insistir en que la marca y el dominio son de una sola
empresa. Si vuelve a rechazar por 3.2, la salida es la distribución sin listar (formulario
https://developer.apple.com/contact/request/unlisted-app/ con el Apple ID `6819117925`).

## Pasos del reenvío (Adam en ASC; Claude prepara)

1. Build **1.0.0 (12)** por `iOS · TestFlight` (`version=1.0.0`, `build=12`) y esperar a que procese (~15 min).
2. Web desplegada con `/contratar` en producción (comprobar `https://artaproducciones.com/contratar` abre sin
   sesión).
3. En la versión 1.0.0: elegir el build 12; pegar texto promocional, descripción, URL de marketing y notas de
   revisión de `IOS-APP-STORE.md` §7; volver a adjuntar el video de revisión (el adjunto está vacío).
4. «Actualizar revisión» → responder en el Resolution Center con el **texto B** → «Volver a enviar a revisión
   de apps» → no navegar hasta ver «Pendiente de revisión».

## Texto B — respuesta en el Resolution Center (en inglés)

```
Hello,

Thank you for the review. We believe the app is intended for a general, public audience of companies, and we
have made changes in build 1.0.0 (12) and in the metadata so this is clear. Answers to your questions:

1. No. The app is not restricted to a single company or organization. ARTA is a workspace platform for
live-event production companies and venues: each customer organization gets its own isolated workspace
(separate data, users, roles and settings). Today it is used by Arta Producciones S.A. de C.V. (the launch
customer, which lends its name to the platform) and by the venue it operates, Auditorio Explanada Puebla, as two
business units; any other production company or venue can contract its own workspace.

2. It is designed for a category of businesses (live-event production companies and venues), not for a closed
list of companies. Any company in that category can become a client: the public contracting page is
https://artaproducciones.com/contratar (also linked from the app's sign-in screen and from the App Store
description), with NEXARA's contact at https://nexara.com.mx/contacto. NEXARA (NEW ENGINEERING EXPERTISE AND
RESOURCE ADVANCEMENT S.A. DE C.V.) develops, operates and publishes the platform.

3. Anyone can download the app and use the demo mode without invitation, registration or affiliation: on the
sign-in screen, "Explorar ARTA con datos de muestra" opens the full app (home, tasks, chat, notifications,
approvals, events) with fictional data from a sample production company, with no account and no network. The
privacy policy, terms, support and contracting pages are also reachable from the sign-in screen.

4. Each organization's administrators create the accounts for their staff and vendors in the ARTA web panel and
hand the credentials to each person; there is no self-registration in the app. A company obtains its workspace
(and its first administrator account) by contracting the service through the page above.

5. No. There is no paid content, no in-app purchase and no subscription. Organizations pay NEXARA for the
service under a commercial agreement outside the app; users pay nothing.

Changes in build 1.0.0 (12), now selected for this version: demo mode available on the sign-in screen
(previously only in our internal builds), link to the contracting page, and texts that no longer describe the
app as the tool of one company. The App Store description, promotional text, support/marketing URLs and review
notes were updated accordingly. The demo account in Sign-in Information remains valid.

Best regards,
NEXARA team
```

## Alternativa descartada: distribución sin listar

Si Apple mantiene 3.2 tras el texto B: formulario de Apple «Request unlisted app distribution» (App name `ARTA
Producciones`, Apple ID `6819117925`, bundle `com.artaproducciones.ops`) y una respuesta corta en el Resolution
Center diciendo que se solicitó. La app pasa la misma revisión, no aparece en búsquedas y se instala por enlace.

## Otros pendientes vistos el 19-10 en App Store Connect

- **El adjunto de App Review está vacío**: las notas citan `ARTA-app-review-1.0.0-build11.mp4` pero
  `appStoreReviewAttachments` no tiene nada. Volver a subirlo (artefacto de la corrida `37971415326` de
  `iOS · video para App Review`) o grabar uno nuevo con la build 12 (incluye el botón del demo).
- Las 7 capturas de iPhone 6,9" son del simulador de iOS (correctas); sin juego de iPad; sin vistas previas.
- La lista de verificación común está en `NEXARA-app/docs/store/IOS-RESPUESTA-APPLE.md` («Lista de verificación
  antes de CADA envío»).