# Sitio público de Arta Producciones

`artaproducciones.com` (`/p/arta`) y su administración en Studio (`/studio`). Rehecho el 01-11-2026 por pedido de Adam:
«un paquete de la página web más complejo y más acorde a Arta Producciones, a los colores y a todo», «que tenga la maqueta
total en Studio web para que los practicantes puedan subir, quitar, bajar y poner historias, noticias, todo».

El mismo día, también de Adam: «las fotos a color pero colores que combinen con la uiux del sitio» y «no quiero una landing
page, dale un desarrollo profesional». Desde entonces es un sitio de páginas reales, no una página larga.

El 02-11-2026, viendo esa versión: «el modelo de la página principal sigue feo, poco premium y profesional, no se ve nivel Apple,
la página no me dice nada». Se le enseñaron dos muestras y dejó elegir: quedó la clara, al estilo del inicio de apple.com.

## Inicio

Una idea por pantalla y nada que no diga algo. En orden:

| Qué | De dónde sale |
|---|---|
| Franja del próximo show | `data.shows[0]`; se apaga con `home_hero.showCount = 0` |
| Portada: titular, texto y dos ligas | `home_hero`. La segunda liga es para quien trae un show, no para quien viene a verlo |
| El logo como ventana al show, que se abre al bajar hasta llenar la pantalla (`HomeHero`) | `HeroSlide`: si hay varias se turnan, con botón de pausa. Ya no llevan texto. Sin JavaScript o con «reducir movimiento» se queda en la primera imagen |
| Mosaico de shows (`ShowTile`) | La cartelera. Con póster, el arte se asoma abajo y le da el color a la tarjeta; sin póster, un escenario a oscuras con reflectores (`StageLights`), para no fingir una foto que no es de ese show |
| Quiénes somos | `home_frase`: etiqueta, titular y dos líneas a tamaño de lectura, con liga a Nosotros |
| Muro de pósters, con los datos de la temporada | Los pósters de los shows, próximos y pasados (`home_muro`). Datos calculados de la cartelera, nunca escritos a mano. Con menos de 5 pósters no sale |
| Mosaico de servicios | `home_modulos.tiles`: se turnan foto y texto grande. `tagline` es su frase; se parte en renglones en cada punto |
| Recintos | `home_recintos`: dirección, cómo llegar y su siguiente show, que reconoce por una palabra (`match`) |
| Oficina | `home_ubicacion`: dirección y mapa a color, más teléfono, correo y redes de «Datos del sitio» |
| Invitación a escribir | `home_cta`; la foto es su `pageImage` |

**Inicio habla al público:** qué viene, quién es Arta, qué ha hecho, qué ofrece, dónde y cómo hablarle. Adam (02-11): «se debe mostrar como la empresa de los eventos e info, pero no registros internos» aunque sean de ejemplo. Nada de órdenes de compra, corridas ni minutos a minuto. «Cómo trabajamos» y «Noches recientes» quedan ocultas por omisión: se pueden poner desde Studio.

**Un show es de Arta si su póster o su ficha lo dicen:** el logo de Arta entre los créditos, arriba o abajo. Nunca por la boletera ni por el recinto. Hay shows en Arema y en eticket que no son de Arta, y hay de Arta fuera de Puebla.

**Sin contenido no hay hueco:** Próximos shows, Noticias, Noches recientes, Historias, Galería y Aliados no salen si están vacías.
Sin shows, el botón de la portada ya no lleva a una cartelera vacía: abre «Traer un show a Puebla» y «Lo que hacemos».

Nosotros, Preguntas y Ubicación siguen como secciones de Inicio pero van ocultas: ya están completas en su página. En una maqueta ya
guardada, una sección base nueva entra oculta (`resolveLayout`), no aparece sola.

## La idea

Cada sección es **su propia página con ruta**, e Inicio resume y lleva a cada una. El sitio y Studio usan el mismo catálogo
(`apps/web/lib/site-blocks.ts`), así que una página o sección nueva se agrega en un solo lugar.

| Ruta | Qué tiene | Se edita en Studio en |
|---|---|---|
| `/p/arta` | Ver «Inicio» arriba | Inicio: fotos, orden de secciones y textos |
| `/p/arta/cartelera` y `/[slug]` | Próximos shows, anteriores y el detalle de cada uno | Cartelera |
| `/p/arta/nosotros` | Quiénes son, datos, cómo trabajan, aliados | Nosotros |
| `/p/arta/servicios` y `/[slug]` | Los servicios y qué incluye cada uno | Servicios |
| `/p/arta/noticias` y `/[slug]` | Publicaciones | Noticias |
| `/p/arta/historias` | Historias tipo Instagram (Adam lo confirmó el 01-11) | Historias |
| `/p/arta/galeria` | Fotos | Galería |
| `/p/arta/preguntas` | Preguntas frecuentes (aquí va el JSON-LD `FAQPage`) | Preguntas |
| `/p/arta/contacto` | Formulario, datos, dirección y mapa | Contacto |

Las vistas viven en `components/site/SiteViews.tsx`; cada ruta solo trae datos y metadatos. Así `/site` pinta exactamente lo
mismo con borradores y navega por dentro (`PublicSite.tsx` intercepta las ligas del sitio y Studio le dice qué página abrir).

**Anclas viejas:** `/p/arta#noticias` y compañía siguen funcionando. El `#` no llega al servidor, así que `LegacyAnchors`
redirige en el navegador y `resolveSiteHref` corrige los botones guardados en Studio con `#algo` (`LEGACY_ANCHORS`).

**Una fila, dos lugares:** la sección de Inicio y la página comparten fila de PageContent. Nosotros se edita una vez: sale
resumido en Inicio (`summary`) y completo en su página (`body`). Cada página suma `pageImage`, `seoTitle` y `seoDescription`.

**Servicios:** viven en `home_modulos.tiles`. Los ya guardados en producción traen solo título y resumen, así que
`servicesOf` completa detalle y foto por nombre con `DEFAULT_CONTENT`; lo que incluye cada uno sale de los formatos reales
(`format-catalog.ts`). La dirección sale del nombre: cambiar el nombre cambia la liga, salvo que fijen `slug`.

| Qué | Dónde se guarda |
|---|---|
| Orden y visibilidad de páginas y de secciones de Inicio | `PageContent` fila `site_layout` (`{ pages: [{ key, visible }], blocks: [{ id, type, visible }] }`) |
| Textos de cada sección | `PageContent`, una fila por sección (`home_about`, `bloque_<id>`…; ver `BLOCK_META`) |
| Correo, teléfono, redes, lema | `PageContent` fila `site_ajustes` |
| Fotos de la portada | `HeroSlide` |
| Cartelera | `NewsPost` con `template = 'evento'` (fecha, hora, lugar, estado de la venta) |
| Noticias | `NewsPost` con otra plantilla o sin ella |
| Historias, galería, aliados | `SiteItem` (`kind`: `historia`, `foto`, `aliado`) |

La portada no entra en el orden: siempre abre la página. Las secciones base se ocultan, no se borran; las
agregadas a Inicio («Texto con foto», «Anuncio») se borran al publicar la maqueta sin ellas. Historias y Galería no salen en el
menú, en Inicio ni en el sitemap mientras no tengan nada publicado.

**Quitar una página** (`isPageOff`) la retira de verdad: su ruta y sus detalles dan 404, sale del menú, del pie, del sitemap y del
feed, su sección deja de salir en Inicio y la portada se queda sin los botones que llevaban ahí. Solo la vista previa de Studio
la sigue enseñando, para poder editarla. Inicio y Contacto no se quitan (`FIXED_PAGES`): todos los botones llevan a Contacto.

**Un show sale solo de la cartelera** al terminar su día en Puebla (`startOfTodayMx`) y pasa a «Shows anteriores» en
`/p/arta/cartelera` y a «Noches recientes» en Inicio.

**Página de un show:** guardar en calendario (Google o `.ics`) y compartir. Uno que ya pasó dice «Ya se presentó» y no ofrece boletos.

**La cartelera no lee los eventos del panel:** son `NewsPost` capturados en Studio. Un `Event` puede ser de prueba o no estar anunciado, y
sus archivos no siempre son el arte del show: el `100X200.jpg` de Earth, Wind & Fire es el pendón de otro festival.

## Borradores y publicación

- **Secciones y maqueta:** el borrador es una fila aparte, `<sección>__propuesta`, nunca pública. `PUT /studio/pages` con
  `draft: true` la escribe; `POST /studio/pages/publish` las vuelve la sección. El practicante siempre escribe ahí.
- **Contenido:** cada cosa tiene su bandera (`active` / `published`). Lo publicado solo lo cambia quien publica.
- **Quién publica:** `canPublishStudio` (el perfil de practicante puede dar `studio.publish`). La API lo aplica; la pantalla
  solo esconde botones.
- **`POST /studio/reorder`:** recibe la lista completa. Sin permiso de publicar se puede mover un borrador, pero el orden
  entre lo publicado no cambia.
- **Vista previa:** `/site` pinta la misma página con `GET /studio/preview`. Dentro de Studio va en un marco (`?embed=1`) y
  recibe por `postMessage` lo que se va escribiendo, sin guardar (`PreviewMessage`).
- **Caché:** las páginas públicas se regeneran cada 30 s y Studio pide refrescar al publicar (`POST /p/arta/revalidar`,
  solo con sesión de Studio).

## Estilos y marca

`apps/web/styles/sitio.scss` (clases `sa-`) lo cargan solo `/p/arta` y `/site`; `styles/studio.scss` (clases `st-`), solo
`/studio`. Tinta y papel, sin dorado. Titulares en Inter Tight (peso 600) y texto en Inter, sin mayúsculas forzadas: viven en
`app/fonts/` (licencia SIL OFL, de `@fontsource-variable`) y las carga `lib/site-fonts.ts`, así que el panel no las descarga. El sitio no
pide nada a Google Fonts.

Marca en `public/brand/`: `arta-logo.svg`, `arta-wordmark.svg` (solo las letras) y `arta-motivo.svg`, la «a» girada del pie
corporativo (`arta-footer.png`). Vectorizados de esos PNG: si diseño entrega los originales, se reemplazan sin tocar código.
Las fotos van a color con `--photo` (`saturate(.9) contrast(1.04)`): un ajuste discreto para que ninguna pelee con la tinta.
Los pósters quedan tal cual porque son el arte del show. Solo van en un tono los logos de aliados. El mapa va a color (Adam, 02-11).

Las fotos se reducen en el navegador antes de subir (`lib/studio-upload.ts`, 2400 px): `next.config.js` tiene
`images.unoptimized`, así que el sitio las sirve tal cual. HEIC se rechaza con una explicación porque Chrome no lo abre.

## Trampas

- **La semilla corre en cada arranque del contenedor.** Antes reescribía secciones y **borraba los slides** en cada
  despliegue; ahora `prisma/seed-studio.ts` solo siembra una base sin contenido.
- **`whitelist` del ValidationPipe:** un campo de DTO sin decorador se tira en silencio. `contentJson` llegaba así: guardar
  contestaba 200 y no cambiaba nada.
- **`{ template: { not: 'evento' } }` deja fuera los NULL** en SQL. Por eso `NOT_A_SHOW` usa `OR`. Prisma de mentira no lo
  detecta: lo prueba `apps/api/test/studio-sitio.e2e-spec.ts` contra base real.
- **Clases genéricas del panel:** `.is-hidden` es `display: none` en `globals.scss`. Dentro de Studio, usar otro nombre.
- **Pruebas:** `page.route` no ve el `fetch` del servidor; el sitio con contenido se prueba en `/site`
  (`e2e/sitio-publico.spec.ts`) y `e2e/public-site.spec.ts` cubre lo que el sitio garantiza sin API.
- **Sin SMTP en producción:** el formulario de contacto arma el correo en la app de quien escribe (`mailto:`) y ofrece
  WhatsApp si está configurado. No guarda nada en el servidor.
