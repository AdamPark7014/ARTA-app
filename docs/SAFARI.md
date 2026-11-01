# Safari (Mac y iPhone) en el panel web

Medio equipo usa Safari en Mac y en iPhone. Aquí está qué se rompía en Safari y en Chrome no, por qué, cómo
se arregló y cómo se prueba para que no regrese.

## 1. Cómo se prueba

### En CI: `.github/workflows/web-safari.yml`

Corre solo al subir cambios de `apps/web/**`, `packages/**`, `package-lock.json` o del propio flujo, y a mano:

```
gh workflow run web-safari.yml -R AdamPark7014/ARTA-app --ref main
gh run watch <id> -R AdamPark7014/ARTA-app
gh run download <id> -R AdamPark7014/ARTA-app -n comparacion
```

| Job | Qué hace |
|---|---|
| `Suite · webkit` | Toda la suite de Playwright (API de mentira, como `ci.yml`) en el motor de Safari de escritorio (1280×720). |
| `Suite · webkit-iphone` | La misma suite con `devices['iPhone 15']`: 393 px, toque, `isMobile`, motor de Safari. |
| `Suite · chromium` / `chromium-iphone` | Las mismas dos, con el motor de Chrome: la línea base. |
| `Cortes · webkit` / `chromium` | El recorrido de «cortes» (`e2e/audit`) en ARTA y Auditorio a 1536×864 y 390×844. |
| `macOS · WebKit` | Prueba corta (Safari, iPhone, login, shell, móvil, tareas) en macOS: WebKit con las bibliotecas de Mac. |
| `Comparar` | **El veredicto.** Falla solo si una prueba pasa en Chromium y falla en WebKit: eso es un fallo de Safari. |

Las suites no tumban el flujo por sí solas: hay pruebas viejas que fallan en los dos motores (ver §5) y eso
no es de Safari. El resumen de la corrida (pestaña *Summary* en GitHub, o el artefacto `comparacion`) lista:
lo que falla solo en WebKit, lo que falla en los dos pero con otro error en WebKit (revisar a mano), y las
pantallas con más cortes en WebKit que en Chromium. Artefactos: `report-<proyecto>` (reporte HTML, trazas
de lo que falló y capturas de `e2e/__mobile__`), `results-<proyecto>` (JSON), `cortes-<motor>` (JSON y
capturas), `report-macos`.

El comparador es `apps/web/scripts/compare-pw-results.mjs` (`suite` y `audit`).

### En una máquina

- **Windows (la de Adam): WebKit no corre.** La política de integridad de código bloquea las DLL sin firmar de
  Playwright WebKit dentro de la app de Claude. Se prueba en CI.
- **Mac o Linux:**

  ```
  echo "127.0.0.1 arta.localhost auditorio.localhost" | sudo tee -a /etc/hosts
  cd apps/web && npx playwright install --with-deps webkit
  E2E_WEBKIT=1 npx playwright test --project=webkit --project=webkit-iphone
  ```

  `E2E_WEBKIT=1` activa los proyectos `webkit`, `webkit-iphone` y `chromium-iphone` (`playwright.config.ts`)
  y `webkit` en `playwright.audit.config.ts`. `E2E_PREBUILT=1` sirve el `.next` ya construido sin volver a
  construir. La línea de `/etc/hosts` hace falta porque `--host-resolver-rules` es solo de Chromium.

### Pruebas que cuidan a Safari

- `e2e/safari-compat.spec.ts`: autollenado del Llavero en login y 2FA, código 2FA con espacio, la pestaña del
  PDF abierta dentro del clic y el visor de PDF sin `Promise.withResolvers`. Abre la pestaña del evento por
  URL para correr también en iPhone.
- `e2e/safari-iphone.spec.ts`: en teléfono ningún campo de texto baja de 16 px (login, código 2FA, tareas,
  evento, OC, anticipos, eventos, nuevo evento), el código 2FA va marcado `one-time-code` / `numeric` y la
  campana con más avisos de los que caben se desvanece abajo.
- `e2e/app-shell.spec.ts`: las dos pruebas de la barra lateral de escritorio se omiten en teléfono (ahí el
  menú es el cajón de `mobile-shell.spec.ts`).
- `e2e/mobile-shell.spec.ts`: todo módulo cabe en 390 px (en `webkit-iphone` corre con el motor de Safari).

## 2. Versión mínima de Safari

**Safari 16.2 / iOS 16.2** (diciembre de 2022). El CSS usa `color-mix()` unas 200 veces (16.2), y `:has()`,
`:focus-visible`, `dvh` y `structuredClone` (15.4). En un Safari más viejo el panel abre, pero pierde colores
de fondo y bordes, y los estados de foco. `dvh` lleva respaldo en `vh`. Si alguien del equipo está en iOS 15,
hay que actualizarle el teléfono, no parchar 200 colores.

## 3. Lo que se rompía y cómo se arregló

| Dónde | Qué pasaba en Safari | Por qué | Arreglo |
|---|---|---|---|
| Login y 2FA (Mac) | Con el Llavero, «Entrar» no hacía nada o mandaba campos vacíos. | El autollenado de Safari pone el valor sin disparar `input`, y React no se entera. | Se manda lo que hay en el formulario (`FormData`), no el estado; el código 2FA viaja solo con dígitos. (`d46a1fa`) |
| PDF de OC, boletera, documento y hoja | El botón no abría nada, sin error. | Safari bloquea `window.open` si llega después de un `await` (generar el PDF tarda). | `lib/open-tab.ts`: la pestaña se abre en blanco dentro del clic y recibe la URL al final; si falla, se cierra. (`d46a1fa`, `5d97eaf`) |
| «Escribir encima» y «PDF a documento» | El visor moría con «Promise.withResolvers is not a function». | El build moderno de pdf.js 4 usa `Promise.withResolvers` (Safari 17.4+). | Build legacy de pdf.js y su worker (`lib/pdfjs.ts`, `scripts/copy-pdf-worker.mjs`). (`d46a1fa`) |
| Login en iPhone | Al tocar correo, contraseña o código, la página se acercaba y quedaba descuadrada. | Safari de iPhone hace zoom en cualquier campo de menos de 16 px; el login tenía 14.5 px (el resto del panel ya tenía 16 px en `.shell`). | 16 px en teléfono (`_acabado.scss`). Prueba: `safari-iphone.spec.ts`. |
| Chat y avisos en iPhone | Tras salir a otra app y volver, los mensajes nuevos no llegaban hasta ~45 s después. | iOS congela la pestaña y corta el socket sin avisar; Socket.IO lo daba por vivo hasta que vencía el ping. | `lib/realtime.ts`: tras más de 30 s oculta, al volver del historial (bfcache) o al recuperar la red, se reconecta de una vez y se vuelve a pedir lo que llegó. |
| Firma con el dedo | Si iOS tomaba el gesto (notificación, borde), el siguiente toque seguía la línea anterior. | Llegaba `pointercancel` y nadie lo escuchaba. | `SignaturePad` termina el trazo en `pointercancel`. |
| Cajas de texto sobre un PDF (iPhone/iPad) | Arrastrar el asa movía la página en vez de la caja. | Sin `touch-action`, el dedo hace scroll y el navegador cancela el arrastre. | `.pdfedit__grip { touch-action: none }` y `pointercancel` suelta la caja. |
| iPhone en horizontal | Textos que crecían solos y tablas descuadradas. | «Text autosizing» de Safari de iPhone. | `-webkit-text-size-adjust: 100%` en `html` (`_mobile.scss`). |
| Campana en teléfono | En Safari < 15.4 el panel de avisos perdía el tope de alto. | `dvh` sin respaldo: la declaración entera se descarta. | `vh` antes de `dvh` (`_mobile.scss`). |
| Entidad activa | Con «Bloquear todas las cookies», `localStorage` lanza `SecurityError` y la pantalla podía caerse. | Safari bloquea también el almacenamiento local. | `getActiveEntity`/`setActiveEntity` con `try` (`lib/api.ts`). |
| Ver un PDF en iPhone o iPad | Solo se veía la primera página; en Android, nada. | iOS pinta un PDF en un iframe como una imagen de su primera página y no deja bajar. | En teléfono y tableta se dibuja con pdf.js, página por página (`components/files/PdfPages.tsx`, `lib/platform.ts`). |
| Hoja con el dedo | Insertar o eliminar filas y renombrar la hoja no existían. | Todo vivía en el clic derecho y el doble clic, que en iOS no llegan. | Botones «Filas y columnas» y «Renombrar» a la vista con puntero táctil; el menú sale como hoja desde abajo y no se cierra al bajar el teclado. |
| Hoja con el dedo | Un toque seleccionaba también la celda de junto. | El toque simula arrastrar el ratón; al enfocar, la hoja se movía y entraba a la vecina. | Arrastrar para seleccionar solo con cursor (`onCellMouseDown`). |
| Chat en iPhone con el teclado abierto | La barra del chat se iba de la pantalla. | Safari de iPhone empuja la página en vez de acortarla. | `lib/use-keyboard-fit.ts` ajusta la caja a `visualViewport`. **Necesita un iPhone de verdad para confirmarse (§6).** |
| Fechas y horas en iPhone | El valor salía centrado y el campo vacío colapsaba a una rayita. | Estilo propio de iOS para `input[type=date\|time]`. | `styles/_safari.scss`, solo en iOS (`@supports (-webkit-touch-callout: none)`). |
| `<summary>` | El triángulo seguía saliendo. | Safari no respeta `list-style: none` en `summary`. | `summary::-webkit-details-marker { display: none }` en todos. |
| Toques en iPhone | Destello gris y retraso al tocar un botón. | Valores por omisión de WebKit. | `-webkit-tap-highlight-color` y `touch-action: manipulation` (`styles/_safari.scss`). |
| Página en iPhone | Lo de abajo quedaba tapado por la barra de Safari. | `100vh` incluye esa barra. | `100dvh` donde hay soporte, en marco y barra lateral. |

## 4. Revisado en el código y sin problema

- **Fechas.** Todo lo que se parsea es ISO: lo que manda el API (con `Z`), `<input type="datetime-local">` →
  `toISOString()` (`lib/event-dates.ts`) y `${día}T${HH:mm}` de `<input type="date|time">`
  (`EventFields.tsx`, `EventTasksPanel.tsx`, `CampaignTimeline.tsx`). No hay `new Date('AAAA-MM-DD HH:mm')`
  con espacio ni `dd/mm/aaaa` sin parsear a mano (`lib/public-sitemap.ts` lo hace con regex).
- **`Intl` / `toLocaleString`.** Solo `es-MX` con `dateStyle`/`timeStyle`, `weekday`, `month`… (Safari 14.1+).
- **Regex.** Sin lookbehind `(?<=`/`(?<!` en el código ni en los chunks del build (Safari < 16.4 tumba el
  archivo entero). `\p{L}` con `u` funciona desde Safari 11.1.
- **APIs nuevas.** `structuredClone` (15.4) solo en `SheetEditor`; `Promise.withResolvers` solo dentro de
  pdf.js legacy, que trae su polyfill; `requestIdleCallback` es el de Next (con respaldo); `crypto.randomUUID`
  solo en pdf.js y con respaldo. Nada de `.at()`, `findLast`, `toSorted`, `Object.hasOwn`.
- **CSS.** Autoprefixer (el de Next) añade `-webkit-backdrop-filter`, `-webkit-user-select`,
  `-webkit-mask-image` y `-webkit-line-clamp`: verificado en el CSS construido. Sin `@container` ni anidado
  nativo; en tablas, `position: sticky` va en `th` (Safari no lo aplica en `thead`/`tr`).
  `scrollbar-width`/`-color` Safari los ignora sin daño.
- **`<input type="date|time">`.** Valores en ISO; el estilo usa `::-webkit-datetime-edit`, que WebKit sí
  tiene. No se usa `showPicker()` ni `<dialog>`.
- **`window.open`.** Todo lo que abre pestaña tras un `await` pasa por `lib/open-tab.ts`. Los
  `window.location.href = …` después de un `await` (pago, cerrar sesión) navegan la misma pestaña: Safari
  no los bloquea.
- **Portapapeles.** Todos los `navigator.clipboard.writeText` están dentro del clic, sin `await` antes.
- **Descargas.** `downloadBlob` usa `<a download>` con `blob:` y revoca la URL a los 30 s (revocarla en el
  acto cortaba la descarga en Safari).
- **Cookies.** De host, `SameSite=Lax`, `Secure` en producción y de primera parte (todo va a `/api` del mismo
  dominio): ITP no las toca. `arta.` y `auditorio.` tienen sesiones separadas a propósito.
- **Notas de voz.** Safari graba AAC (`audio/mp4;codecs=mp4a.40.2` → `.m4a`) y el API acepta `.m4a`; en
  Chrome se convierte a WAV. Un `.ogg`/`.webm` que Safari no sepa reproducir cae a «No se puede ver aquí» con
  descarga (`AttachmentView`), no a un reproductor mudo.
- **Video y audio.** `playsInline` y `preload="metadata"`; los archivos los sirve `express.static`, que
  responde rangos (206): Safari no reproduce media de un servidor sin `Range`.
- **Subidas desde iPhone.** Con `accept="image/*"`, iOS entrega la foto HEIC ya convertida a JPEG. Desde una
  Mac sí puede salir un `.heic` (fotos pasadas por AirDrop), y de iPhone un video sale `.mov`: hoy
  `POST /uploads` solo acepta pdf, imágenes web y Office (`ALLOWED_EXTENSIONS`), aunque el formato ofrece
  `video/*`. Al cierre de esta revisión otro turno estaba sumando HEIC/MOV/MP4 a `POST /uploads`
  (`MEDIA_EXTENSIONS` en `upload-storage.ts`, sin subir). Ojo: un HEIC guardado tal cual se ve en Safari, pero
  no en Chrome de Windows.
- **Avisos web.** En iPhone solo existen con el panel instalado en la pantalla de inicio (iOS 16.4+):
  `getWebPushStatus` responde `needs-install` y `requestPermission` se llama dentro del clic.
- **`fetch`.** Solo `keepalive` en `lib/report-error.ts` (Safari 13+); sin streams de subida.

## 5. Resultado de la revisión (29-10-2026)

Corridas de `web-safari.yml`: `40959124778` (primera, sin arreglos), `40962164723` y `40964485412`
(con los arreglos de §3; todos los jobs en verde).

| Proyecto | Pasan | Fallan | Fallan solo en WebKit |
|---|---|---|---|
| Safari de escritorio (`webkit`) contra `chromium` | 91 / 91 | 23 / 23 | **0** |
| iPhone 15 (`webkit-iphone`) contra `chromium-iphone` | 89 / 89 | 23 / 23 (2 omitidas: barra lateral de escritorio) | **0** |
| macOS (`webkit` + `webkit-iphone`, prueba corta) | 108 | 0 | — |

Ninguna prueba que pasa en Chrome falla en el motor de Safari, ni en Linux ni en macOS, ni en escritorio ni en
iPhone; y las que fallan en los dos fallan con el mismo error. El recorrido de cortes (162 pantallas por
motor) solo dio una diferencia: la campana de ARTA a 390 px, donde WebKit medía el último aviso cortado en
seco, sin el desvanecido. La prueba `safari-iphone.spec.ts` ve el desvanecido en WebKit (Linux y macOS):
el recorrido medía antes de que `useShellPolish` lo pusiera en el siguiente cuadro, y ahora espera ese cuadro.
En la corrida `40966061877` WebKit queda en cero en las cuatro combinaciones (ARTA y Auditorio, 1536×864 y
390×844). El log mostró por qué: en el runner, WebKit sin ventana tardaba hasta 1.3 s en dar dos cuadros
(Safari de verdad los da a 60–120 por segundo). No es de la app.

Las 23 pruebas que fallaban **en los dos motores** se pusieron al día el 01-11-2026 (eran de la interfaz, no de
Safari). Al hacerlo salieron errores reales que esas pruebas ya no vigilaban: fórmulas que se perdían al reabrir la
hoja, PDF de corrida con totales viejos, tablas de Word que desaparecían y PDF con la primera página vacía. Antes de
eso estos flujos no estaban cubiertos en ningún navegador:

- `editors`, `excel-hf`, `excel-snapshots`, `hotfix-sheet-editor`, `correcciones-0930`: hoja de cálculo y
  documento embebidos (las celdas ya no se encuentran por su etiqueta).
- `event-edit` (5): datos y fecha del show (`.event-facts` y «Editar datos» cambiaron).
- `purchase-orders` (3, crear OC) y `hub-critical` (5: hoja de gastos, ExpandBox, banner de ventana de OC,
  corrida).
- `calendar` (encabezado) y `public-site` (2, contenido del sitio público).

## 6. Lo que necesita un Safari de verdad (persona)

Playwright WebKit es el motor de Safari, no Safari: no trae Llavero, ni el bloqueador de ventanas tal cual,
ni la cámara y el micrófono reales, ni el congelado de pestañas de iOS. Pasar por esto una vez con la build
desplegada, en una Mac y en un iPhone:

1. Login con el Llavero (correo y contraseña guardados) y el código 2FA desde Contraseñas / la app
   autenticadora: entra a la primera.
2. En iPhone, tocar correo, contraseña y código: la página no se acerca.
3. PDF de una OC, de la boletera, de un documento y de una hoja: se abre en otra pestaña, sin aviso de
   ventana bloqueada.
4. «Escribir encima» de un PDF y mover una caja con el dedo (iPhone o iPad).
5. Firmar un formato con el dedo y con Apple Pencil.
6. Chat: grabar una nota de voz en iPhone, oírla en la Mac y en Android; salir a otra app un minuto, volver y
   recibir un mensaje sin recargar.
7. Subir evidencia desde iPhone: foto (debe llegar JPEG) y video (`.mov`; depende del cambio del API de §4).
   Desde la Mac, una foto `.heic` pasada por AirDrop.
8. Descargar un PDF generado en el navegador (convenios, campaña) en iPhone: sale la hoja de descarga.
9. Avisos web: instalar el panel en la pantalla de inicio (Compartir → Agregar a inicio) y activar avisos.
10. iPhone en horizontal en una tabla larga (OC, tareas): el texto no crece solo.
11. Abrir un PDF de varias páginas en iPhone: se ven todas al bajar.
12. Hoja en iPhone o iPad: un toque selecciona, el segundo edita, «Filas y columnas» inserta donde estás.
13. Chat en iPhone: tocar el campo de escribir; la barra del chat sigue arriba y el campo queda sobre el teclado.
