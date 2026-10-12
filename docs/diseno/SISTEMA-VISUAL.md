# Sistema visual ARTA y Auditorio (aprobado por Adam, 11-10-2026)

Referencia visual exacta: `docs/diseno/propuesta-arta-auditorio.png` y su HTML
`docs/diseno/propuesta-arta-auditorio.html` (abrirlo en el navegador). Pedido de Adam: blanco, grises y negro
en los dos, pero **opuestos**: ARTA claro y redondeado, Auditorio oscuro y recto. «Hiper profesional en la
implementación, con letras redondeadas amigables».

## Principios

- Monocromo: nada de azul, violeta ni dorado en la interfaz. El acento de ARTA es negro tinta; el de
  Auditorio, plata metálica.
- Opuestos: ARTA = papel y tinta, esquinas redondeadas, botones píldora, sombras suaves. Auditorio = negro
  profundo con brillo de reflector arriba, plata, esquinas rectas (4–6 px), líneas finas.
- Profesional: grilla de 4 px, espaciado constante, cifras con números tabulares, estados claros (relleno =
  requiere acción, contorno = informativo), foco visible, contraste AA, vacíos y cargas con el mismo estilo.
- Densidad de herramienta de trabajo: barra superior con buscador, menú por secciones con contadores.

## Tipografía

- Interfaz: **Nunito** (web y Android; Google Fonts, OFL), pesos 300–800. En iOS: la del sistema en diseño
  redondeado (**SF Pro Rounded**: `.fontDesign(.rounded)`).
- Logo ARTA: la imagen real `apps/web/public/brand/arta-logo-ink.png` (negra) en claro. Si se compone en texto:
  Outfit 900, `letter-spacing -2px`.
- Logo Auditorio: «EXPLANADA» en Outfit 800, `letter-spacing 1.5px`, relleno con el degradado plata; debajo
  «AUDITORIO AREMA» en etiqueta.
- Escala:
  - Saludo/título de pantalla: 30 px, peso 300, con el nombre en 600 («Buenos días, **José Luis**»).
  - Título de panel: 13.5–15 px, 600.
  - Cuerpo: 13–14 px, 400–500.
  - Etiqueta (cap): 10–11 px, 600, MAYÚSCULAS, `letter-spacing 1.6px`.
  - Cifra de tarjeta: 34 px (móvil 28), peso 300, `font-variant-numeric: tabular-nums`.
  - Horas y montos: tabulares.

## Tokens

| Token | ARTA (claro) | Auditorio (oscuro) |
|---|---|---|
| fondo | `#f7f6f3` | `#08080a` + `radial-gradient(560px 320px at 62% -12%, rgba(199,204,212,.14), transparent 70%)` |
| superficie (tarjeta) | `#ffffff` | `linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.012))` (sólido `#111114`) |
| superficie suave (menú, inputs) | `#fcfbf9` | `rgba(255,255,255,.035)` |
| segmentado (fondo) | `#efede8` | `rgba(255,255,255,.035)` + borde `rgba(255,255,255,.06)` |
| texto | `#0c0c0d` | `#f2f2f4` |
| texto secundario | `#55555c` | `#a1a1aa` |
| texto terciario | `#8b8b92` | `#85858e` |
| línea | `rgba(12,12,13,.07)` | `rgba(255,255,255,.07)` |
| línea fuerte | `rgba(12,12,13,.12)` | `rgba(255,255,255,.12)` |
| acento (acción principal) | `#0c0c0d` | `linear-gradient(135deg,#f1f3f6 0%,#c7ccd4 55%,#9aa1ac 100%)` (sólido `#c7ccd4`) |
| texto sobre acento | `#ffffff` | `#0a0a0b` |
| sombra tarjeta | `0 1px 2px rgba(12,12,13,.04), 0 10px 26px rgba(12,12,13,.05)` | `inset 0 1px 0 rgba(255,255,255,.05)` |
| radio tarjeta | 16 px | 6 px |
| radio control (botón, chip, estado) | píldora (999 px) | 4 px |
| radio ítem de menú | 10 px | 4 px |
| peligro / ok / aviso | `#b42318` / `#067647` / `#b54708` | `#f97066` / `#47cd89` / `#fdb022` |

Los colores semánticos solo en errores y alertas reales, nunca de decoración.

## Componentes (web)

- **Menú lateral** (228 px): logo, switch Arta | Auditorio (segmentado; la opción activa en ARTA es blanca
  con sombra, en Auditorio plata), grupos «Operación» y «Equipo» con etiqueta, ítems con ícono de línea 16 px
  y contador a la derecha. Activo: ARTA fondo negro/texto blanco; Auditorio plata/texto negro.
- **Barra superior** (58 px): buscador (Ctrl K) que lleva a lo que ya busca el menú, campana de avisos y
  avatar con iniciales. Línea inferior fina.
- **Tarjeta de cifra**: etiqueta, cifra grande, detalle en terciario y, si aplica, barra de avance de 3 px.
- **Panel**: título 600 + acción «Ver todo» en terciario; filas separadas por línea fina.
- **Línea de tiempo**: hora tabular, punto (relleno = hecho/en curso, contorno = pendiente), título y detalle.
- **Estado**: «lleno» (requiere acción) = acento con su texto; «borde» = contorno de línea fuerte con texto
  secundario. MAYÚSCULAS 10.5 px.
- **Botones**: primario = acento; secundario = superficie con borde de línea fuerte.
- **Formularios**: campos de superficie con borde línea fuerte, foco con anillo de 2 px del texto al 15 %.
- **Tablas y hoja de formatos**: encabezado en etiqueta, filas con línea fina; en ARTA fondo blanco, en
  Auditorio superficie oscura.

## Apps (iOS y Android)

- ARTA en modo claro y Auditorio en oscuro, según la entidad activa (el doble toque en Inicio cambia todo).
- Mismos tokens; tarjetas 16 px vs 6 px; botones píldora vs 4 px; barra de pestañas con línea fina superior.
- Inicio: saludo, dos tarjetas de cifra, «Hoy» como línea de tiempo y la lista de pendientes.
- Aviso al cambiar de entidad: en ARTA, píldora negra; en Auditorio, plata con texto negro.

## Implementación web (11-10-2026)

- Tokens en `apps/web/styles/globals.scss`, bajo `[data-entity='ARTA']` y `[data-entity='EXPLANADA']`. El atributo
  va en `<html>` (script inicial en `lib/entity-theme.ts` y `useEntityTheme` en el marco), así que modales,
  menús y avisos heredan el tema. `:root` sigue oscuro solo para el sitio público y el portal de proveedores.
- Nombres: `--bg`, `--card-bg` (superficie de tarjeta), `--bg-elev` (superficie opaca), `--bg-soft`, `--seg-bg`,
  `--text`, `--muted` (secundario), `--text-3` (terciario), `--line`, `--line-strong`, `--line-field`,
  `--accent` / `--accent-fill` / `--on-accent`, `--danger` / `--ok` / `--warn`, `--radius-lg` (tarjeta),
  `--radius-ctl` (botón, chip, estado), `--radius-item` (menú), `--shadow-card`, `--hover`, `--ring` (foco).
- Contraste AA verificado por DOM en las dos entidades. Dos ajustes respecto a la tabla: el terciario de ARTA
  es `#6b6b73` (el `#8b8b92` da 3.4:1 sobre blanco) y el del Auditorio `#8a8a93` (bajo el reflector el
  `#85858e` quedaba en 4.4:1).
- Letra: Nunito variable y Outfit 800/900 con `next/font` (se sirven desde el propio dominio).
- La hoja de formatos (`.fsheet`) y los editores de hoja y documento siguen siendo papel claro en los dos temas.

## Sin cortes (pulido web, 11-10-2026)

Pedido de Adam: «tiene muchos cortes no agradables». Reglas (estilos en `apps/web/styles/_pulido.scss`, que va al
final de `globals.scss`; comportamiento en `components/app-shell/useShellPolish.ts`):

- Títulos y detalles pasan a **dos renglones** (`line-clamp: 2`) en vez de cortarse en uno: filas de Inicio, línea
  de tiempo, tarjetas de evento y de anticipo, formatos, tareas, archivos. Un solo renglón con «…» solo en filas
  densas (vista previa del chat, responsables, título de la barra) y siempre con el texto completo en `title`
  (lo pone el hook; cualquier otro texto o campo cortado lo recibe al pasar el cursor).
- Listas, pestañas y tablas con scroll propio se **desvanecen** en el borde por donde sigue el contenido, y solo
  cuando de verdad desbordan (`data-fade-x` / `data-fade-y`). Nunca un ítem partido a la mitad con borde duro.
- Rejillas de una columna con `minmax(0, 1fr)`: ninguna tira o tabla ensancha la pantalla (a 1280 px el evento se
  salía por la derecha).
- Tarjetas de una fila con la misma altura y el detalle abajo; cifras grandes que se ajustan al ancho
  (`container-type`), tabulares.
- Menú lateral más compacto en laptops bajas (`max-height: 800px`); pie con nombre corto (nombre + primer
  apellido) y puesto en dos renglones.
- Barra superior sin línea arriba; la línea y una sombra suave aparecen al bajar (`html[data-scrolled]`).
- Entrada del contenido en 180 ms y nada de movimiento con «reducir movimiento».
- Recorrido de comprobación: `npx playwright test -c playwright.audit.config.ts` (en `apps/web`, con el panel en
  el puerto 3100) revisa todas las pantallas en las dos entidades a 1536×730, 1536×864, 1280×720 y 390×844:
  texto cortado, recortes, scroll lateral, controles encimados y contraste. Datos de prueba en
  `e2e/support/rich-fixtures.ts`.
