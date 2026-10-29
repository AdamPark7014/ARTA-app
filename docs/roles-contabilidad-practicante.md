# Contabilidad y practicantes (junta 23-10-2026)

Dos roles nuevos en `apps/api/src/common/rbac/roles.ts` (copia idéntica en `packages/rbac/src/roles.ts`).

## `contabilidad` · «Contabilidad y comercial»

Pedido: «Paula Farfán: Auditorio y Arta en temas contables, que tenga accesos muy puntuales a temas
comerciales y contables». Entidades por omisión: Arta y Auditorio.

| Puede | No puede |
|---|---|
| Ver eventos y la torre de OC; subir comprobantes o facturas y **marcar OC pagadas** (días de cobro) | Autorizar, rechazar, crear, editar o borrar OC |
| Ver anticipos y **marcarlos pagados** con comprobante | Aprobar o rechazar anticipos; solicitarlos |
| Ver y editar la **corrida** (finanzas); generar su Excel | Quitar el sello de una corrida (dirección) |
| Editar **campañas**, mandarlas a revisión y marcarlas pagadas | Autorizarlas o reabrirlas |
| Editar **convenios / patrocinios** (por `finance.edit`) | Editar formatos, checklists o datos del evento |
| Editar **boletera** | Usuarios, organizaciones, auditoría, webhooks, configuración |
| Reemplazar corrida, campaña o boletera por documento externo | Reemplazar un formato, pendones u OC |
| Tareas, chat general y directos | Entrar sola a los canales de chat de un evento (sí si alguien la agrega) |

Permisos: `finance.view`, `finance.edit`, `po.mark_paid`, `campaign.view`, `campaign.edit`, `ticketing.edit`.
En el menú le salen «Finanzas» y «Anticipos» en Control.

### Alta de Paula en producción

`prisma/new-team-members.ts` la trae con `randomPasswordUnlessEnv`: si el seed del arranque la crea sin
`SEED_PASS_PAULA`, le pone una contraseña aleatoria que nadie conoce. La real se fija con el script, que no
imprime nada secreto y escribe la contraseña solo en el archivo de `--out` (fuera del repo, permisos 600, no
sobrescribe):

```sh
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/alta-paula-contabilidad-2310.ts --dry
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/alta-paula-contabilidad-2310.ts --out=/tmp/arta-paula.txt
docker cp arta-api:/tmp/arta-paula.txt ./arta-paula.txt && docker exec arta-api rm /tmp/arta-paula.txt
```

`--keep-password` ajusta solo rol y entidades. Si la cuenta ya existía y cambia, se cierran sus sesiones.

## `practicante` · «Practicante (sitio y redes)»

Pedido: «Montse redes sociales: plantilla de página web y acceso para practicantes». Entidad por omisión:
Arta (el sitio público es de Arta). Lo da de alta dirección adjunta (Montse) desde Panel → Usuarios.

| Puede | No puede |
|---|---|
| Studio: noticias, slides y secciones **como borrador** | Publicar, activar slides ni tocar lo que ya está en el sitio |
| «Enviar a revisión»: avisa a quien tiene `studio.publish` | Eventos, OC, finanzas, campaña, boletera, formatos |
| Calendario de shows en **solo lectura** (`GET /calendar/events`) | Escribir notas del calendario o abrir el evento |
| Chat general y directos | Canales de eventos, tareas, carpetas generales |

Permiso: `studio.edit`. Las carpetas solo las ve si dirección las comparte con su rol
(`allowedRoles: ['practicante']`). Si Montse quiere que un practicante publique, le da `studio.publish` como
permiso extra.

## Plantilla de página web en Studio

Studio no crea páginas sueltas: cada **noticia** ya es una página del sitio (`/p/arta/noticias/:slug`), sale en
«Noticias» del inicio y en el feed. La plantilla es un tipo de noticia con sus campos
(`apps/web/lib/studio-templates.ts`, columnas nuevas en `NewsPost`, migración `20261029120500`):

- **Publicación / noticia**: portada, título, entrada, texto y botón opcional.
- **Evento destacado**: lo mismo más la **fecha del show** y el botón (por omisión «Comprar boletos»). No se
  publica sin fecha. La tarjeta del inicio muestra «Evento · fecha» y la página, la fecha y el botón.

Flujo: el practicante abre Studio → Noticias → elige plantilla → llena los campos (el texto guía dice qué va) →
«Guardar borrador» → «Enviar a revisión». A Montse (y a quien publica) le llega el aviso con liga a
`/studio?tab=news`; ella abre «Editar», ajusta y publica. Para secciones del inicio, el practicante guarda una
**propuesta** aparte (`home_hero__propuesta`, nunca pública); dirección la carga en el editor y al guardar la
sección la propuesta se borra, o la descarta.
