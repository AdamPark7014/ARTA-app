# Sitio público de Arta Producciones

`artaproducciones.com` (`/p/arta`) y su administración en Studio (`/studio`). Rehecho el 01-11-2026 por pedido de Adam:
«un paquete de la página web más complejo y más acorde a Arta Producciones, a los colores y a todo», «que tenga la maqueta
total en Studio web para que los practicantes puedan subir, quitar, bajar y poner historias, noticias, todo».

## La idea

La página es una **maqueta**: una lista de secciones en orden. El sitio la pinta y Studio la edita con el mismo catálogo
(`apps/web/lib/site-blocks.ts`), así que agregar una sección nueva es un solo lugar.

| Qué | Dónde se guarda |
|---|---|
| Orden y visibilidad de las secciones | `PageContent` fila `site_layout` (`{ blocks: [{ id, type, visible }] }`) |
| Textos de cada sección | `PageContent`, una fila por sección (`home_about`, `bloque_<id>`…; ver `BLOCK_META`) |
| Correo, teléfono, redes, lema | `PageContent` fila `site_ajustes` |
| Fotos de la portada | `HeroSlide` |
| Cartelera | `NewsPost` con `template = 'evento'` (fecha, hora, lugar, estado de la venta) |
| Noticias | `NewsPost` con otra plantilla o sin ella |
| Historias, galería, aliados | `SiteItem` (`kind`: `historia`, `foto`, `aliado`) |

La portada no entra en el orden: el encabezado flota sobre ella. Las secciones base se ocultan, no se borran; las
agregadas («Texto con foto», «Anuncio») se borran al publicar la maqueta sin ellas.

**Un show sale solo de la cartelera** al terminar su día en Puebla (`startOfTodayMx`) y pasa a «Shows anteriores» en
`/p/arta/cartelera`. Los próximos shows con póster entran solos a la portada (`home_hero.showCount`).

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
`/studio`. Tinta y papel, sin dorado. Titulares en Outfit y texto en Nunito, ambas locales: el sitio no pide nada a Google Fonts.

Marca en `public/brand/`: `arta-logo.svg`, `arta-wordmark.svg` (solo las letras) y `arta-motivo.svg`, la «a» girada del pie
corporativo (`arta-footer.png`). Vectorizados de esos PNG: si diseño entrega los originales, se reemplazan sin tocar código.
Las fotos de portada y galería van en blanco y negro con CSS; los pósters y las historias, a color.

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
