# Google Business Profile y Search Console — Arta Producciones

Todo lo que se puede preparar sin la cuenta de Google ya está aquí. Lo que queda es de Adam porque pide
iniciar sesión en Google y verificar el negocio (video, llamada, SMS o postal). Copia y pega tal cual.

Estado del sitio al 23-10-2026: `artaproducciones.com` ya tiene título, descripción, canonical, Open Graph,
imagen para compartir y datos estructurados en cada página pública. Sitemap y robots listos (ver
[`docs/SITEMAP.md`](../SITEMAP.md)).

---

## 1. Ficha de Google Business Profile

Entrar a <https://business.google.com/create> con la cuenta de Google que va a administrar la ficha (la
de Arta, no una personal si se puede). Antes de crearla, buscar «Arta Producciones Puebla» en Google Maps:
si ya existe una ficha, se **reclama** («¿Eres el propietario?») en vez de crear otra.

### Nombre del negocio

```
Arta Producciones
```

Solo el nombre real. Nada de «Arta Producciones · Conciertos Puebla»: Google suspende fichas con palabras
clave en el nombre.

### Categorías

El selector está en español y los nombres pueden variar un poco. Escribe la palabra y elige la que aparezca;
si alguna no existe en el selector, sáltala (no hay que forzar ninguna).

| | Categoría (como suele aparecer) | Nombre en inglés de Google | Por qué |
|---|---|---|---|
| Principal | **Empresa de gestión de eventos** | Event management company | Arta produce y opera el evento completo (técnica, hospitality, boletera, cierre). Es la que mejor describe una productora de conciertos. |
| Secundaria | Organizador de eventos | Event planner | Cubre búsquedas de «organizador / productora de eventos en Puebla». |
| Secundaria | Agencia de entretenimiento | Entertainment agency | Conciertos y shows con artistas. |

No usar «Sala de conciertos», «Auditorio» ni «Lugar para eventos»: describen un recinto, y Arta no atiende
al público en un local propio. El **Auditorio Arema Explanada** es un venue aliado: si tiene su propia
ficha en Maps, esa es del recinto, no de Arta (no reclamarla desde aquí).

### Ubicación: negocio de área de servicio

El sitio no publica una dirección de oficina, así que la ficha va como **negocio que atiende en el lugar del
cliente**:

1. «¿Quieres agregar una ubicación que los clientes puedan visitar?» → **No**.
2. Áreas de servicio (se pueden ajustar después; máximo 20):
   ```
   Puebla
   San Andrés Cholula
   San Pedro Cholula
   Estado de Puebla
   ```
3. Google igual pide un **domicilio real para verificar** (no se muestra en la ficha si respondiste «No»):
   el de la oficina o bodega de Arta. Tiene que poder recibir correo o grabarse en video.

### Contacto

- Teléfono: `[[TELÉFONO DE ARTA — el que contesta propuestas]]` (opcional, pero las fichas con teléfono
  reciben más contacto; si se pone, conviene mostrarlo también en el sitio con `NEXT_PUBLIC_CONTACT_PHONE`).
- Sitio web (con UTM para distinguir las visitas que vienen de la ficha):
  ```
  https://artaproducciones.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp
  ```
  Esa dirección redirige a la portada (`/p/arta`) y conserva los `utm_*`. Hoy el sitio no tiene analítica
  instalada, así que la UTM solo sirve el día que se instale; mientras, las visitas desde la ficha se ven en
  el propio panel de Business Profile («Rendimiento»).

### Horario (borrador, ajustar)

```
Lunes a viernes   10:00 – 19:00
Sábado            Cerrado
Domingo           Cerrado
```

Si atienden por cita o el equipo trabaja en función de los shows, también se puede dejar **sin horario**
(Google lo permite en negocios de área de servicio). No poner «Abierto 24 horas».

### Descripción (pegar tal cual · 616 caracteres, límite 750)

```
Arta Producciones es una productora de conciertos y eventos con base en Puebla. Nos encargamos del show completo: producción técnica (riders, plantas de luz, stage hands y minuto a minuto), hospitality para artistas (hospedaje, transporte, catering y camerinos), área comercial (boletera, patrocinios, artes y campaña) y el cierre financiero de cada evento, con formatos y firmas digitales. Trabajamos con el Auditorio Arema Explanada como venue aliado y con recintos de la región. Si tienes una fecha, un artista o un recinto en mente, escríbenos con el alcance del evento y te enviamos una propuesta de producción.
```

Sale del texto del sitio (secciones Nosotros, Operación y FAQ). Google no deja poner enlaces ni precios en
la descripción.

### Servicios

En «Editar perfil → Servicios» → «Agregar servicio personalizado». Nombre y descripción:

| Servicio | Descripción (≤300 caracteres) |
|---|---|
| Producción integral de conciertos | Producimos el show de principio a fin: técnica, hospitality, comercial y cierre del evento. |
| Producción técnica | Riders técnicos, plantas de luz, stage hands y minuto a minuto del evento. |
| Hospitality para artistas | Hospedaje, transporte, catering y camerinos para artistas y su equipo. |
| Boletera y patrocinios | Boletera, patrocinios y relación comercial del evento. |
| Artes y campaña | Artes del show y campaña de difusión autorizada. |
| Cierre financiero del evento | Corrida financiera, anticipos, órdenes de compra y firmas de entregado y autorizado. |

### Fotos

- Logo: `apps/web/public/icons/icon-512.png` (cuadrado, ya es el ícono «A · Papel») o
  `apps/web/public/brand/arta-logo-ink.png` si se quiere la palabra completa.
- Portada (1080 × 608 recomendado): una foto **real** de un show producido por Arta. No usar la tarjeta para
  compartir (`brand/og-arta.png`): Google la marca como «imagen con texto» y la baja.
- 3 a 10 fotos de montajes, escenario y equipo. Fotos reales de eventos de Arta, no de stock.

### Verificar la ficha

Google elige el método según la ficha; hoy lo más común es **video**:

1. En la ficha, «Verificar» → si ofrece **video**: grabar un solo clip continuo (1–2 min) que muestre
   el letrero o material de Arta Producciones, el lugar (calle o entrada) y algo que pruebe que el negocio
   es suyo (equipo, oficina, una factura o el acceso al panel de Arta). Subirlo desde la app de Google Maps
   o desde el navegador del teléfono.
2. Si ofrece **llamada o SMS**: el código llega al teléfono de la ficha.
3. Si ofrece **postal**: llega al domicilio de verificación en 5–14 días con un código de 5 dígitos; no
   editar nombre, dirección ni categoría mientras llega (reinicia el proceso).
4. La revisión tarda de unas horas a 5 días hábiles. Hasta entonces la ficha no aparece en Maps.

Después de verificar: pedir reseñas a clientes reales (promotores, artistas, recintos) con el enlace
«Pedir reseñas» de la ficha. Nunca reseñas propias o pagadas.

---

## 2. Google Search Console

### Dónde está el DNS

```
nslookup -type=NS artaproducciones.com
artaproducciones.com  nameserver = byron.ns.cloudflare.com
artaproducciones.com  nameserver = kay.ns.cloudflare.com
```

El DNS se administra en **Cloudflare** (cuenta de Cloudflare donde está `artaproducciones.com`).

Ojo: el dominio **ya tiene** un registro TXT de Google:

```
artaproducciones.com  TXT  "google-site-verification=uq6Y…HVM"
```

Alguien ya verificó el dominio con alguna cuenta de Google (Search Console o Google Workspace). Primer
paso: entrar a <https://search.google.com/search-console> con la cuenta de Arta y ver si la propiedad
`artaproducciones.com` ya aparece. Si aparece, saltar al paso «Enviar el sitemap». Si no aparece, la
verificó otra cuenta: se puede pedir acceso al dueño (Configuración → Usuarios y permisos) o verificar con la
cuenta propia como se explica abajo. **No borrar el TXT existente.**

### Verificar como propiedad de dominio (recomendado)

La propiedad de dominio cubre `https`, `http`, `www` y los subdominios de una vez.

1. Search Console → «Agregar propiedad» → **Dominio** → `artaproducciones.com` → Continuar.
2. Google detecta Cloudflare y ofrece **«Iniciar verificación»** con Cloudflare: iniciar sesión en Cloudflare
   y autorizar; agrega el TXT sola. Si no lo ofrece, copiar el valor `google-site-verification=…` que muestra.
3. Cloudflare → `artaproducciones.com` → DNS → Records → **Add record**:
   - Type: `TXT`
   - Name: `@`
   - Content: el valor copiado (completo, con `google-site-verification=`)
   - TTL: Auto
4. Volver a Search Console → **Verificar**. Si falla, esperar 10–30 minutos y repetir.

### Alternativa: etiqueta meta (solo si no se puede tocar el DNS)

Solo sirve para una propiedad «Prefijo de URL» (`https://artaproducciones.com/`). Search Console da
`<meta name="google-site-verification" content="XXXX">`; se copia solo el `XXXX` a
`deploy/.env.arta` en el servidor:

```
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=XXXX
```

y se reconstruye la web (`bash deploy/update.sh --force-all`): es variable de build, no basta con reiniciar.
El código ya la pinta en la portada (`app/p/arta/layout.tsx`); nada queda escrito a mano en el repo. Igual con
Bing: `NEXT_PUBLIC_BING_SITE_VERIFICATION`.

### Enviar el sitemap

1. Search Console → propiedad `artaproducciones.com` → **Sitemaps**.
2. En «Agregar un sitemap nuevo» escribir `https://artaproducciones.com/sitemap.xml` → Enviar.
3. Debe quedar «Correcto» con 9 URL descubiertas (portada, 3 noticias, contratar y 4 legales; crece solo
   cuando se publican noticias en Studio).
4. **Inspección de URLs** → `https://artaproducciones.com/p/arta` → «Solicitar indexación». Repetir con una
   noticia.

### Bing (5 minutos, opcional)

<https://www.bing.com/webmasters> → «Importar desde Google Search Console»: trae la propiedad y el sitemap.

---

## 3. Redes sociales en el sitio

El sitio no muestra redes porque no hay ninguna confirmada. Cuando Adam confirme las URL reales, se ponen en
`deploy/.env.arta` del servidor (URL `https://` completa) y se reconstruye la web:

```
NEXT_PUBLIC_SOCIAL_INSTAGRAM=https://www.instagram.com/...
NEXT_PUBLIC_SOCIAL_FACEBOOK=https://www.facebook.com/...
NEXT_PUBLIC_SOCIAL_TIKTOK=https://www.tiktok.com/@...
NEXT_PUBLIC_SOCIAL_YOUTUBE=https://www.youtube.com/@...
NEXT_PUBLIC_SOCIAL_TWITTER=https://x.com/...
```

Aparecen en el pie del sitio («Redes») y en `sameAs` del JSON-LD de la organización, que es lo que Google usa
para ligar la ficha, el sitio y las redes como la misma empresa. Las mismas URL van en la ficha de Business
Profile («Perfiles sociales»).

---

## 4. Comprobar después de desplegar

```bash
curl -s https://artaproducciones.com/robots.txt
curl -s https://artaproducciones.com/sitemap.xml
curl -sI https://arta.artaproducciones.com/login | grep -i x-robots-tag   # noindex, nofollow
curl -sI https://www.artaproducciones.com/p/arta | grep -i -E "^HTTP|location"  # 308 → sin www
```

- Datos estructurados: <https://search.google.com/test/rich-results?url=https%3A%2F%2Fartaproducciones.com%2Fp%2Farta>
  y <https://validator.schema.org/> con la misma URL.
- Vista previa al compartir: <https://www.opengraph.xyz/url/https%3A%2F%2Fartaproducciones.com%2Fp%2Farta>.
