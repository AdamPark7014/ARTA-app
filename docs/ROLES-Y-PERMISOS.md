# Roles y permisos (cliente, 01-11-2026)

Quién ve y quién edita cada cosa. La fuente es `packages/rbac/src/roles.ts`, con copia idéntica en
`apps/api/src/common/rbac/roles.ts`: **cada cambio va a los dos**. El panel y las apps esconden lo que no
toca, pero quien manda es el API: `apps/api/src/events/event-visibility.ts` quita del evento lo que la
persona no debe ver antes de mandarlo.

## Módulos por persona

| | Arta | Auditorio |
|---|---|---|
| **Chacho y Arturo** (`dir_general`) | Todo; autorizan OC; únicos con usuarios | Todo |
| **Leida y Sol** (`dir_adjunta`) | Todo; la corrida la suben, no la modifican; OC en solo lectura | Sin acceso |
| **Juan Pablo** (`compras`) | Ve todo menos corrida; **único que hace OC** | Igual, y edita Barra y Merch |
| **Williams** (`produccion`) | Ve todo menos corrida y OC; edita campaña, producción, transporte y hospedaje | Ve y edita todo menos OC |
| **Rodrigo** (`dir_auditorio`) | Solo formatos de transporte, hospedaje y catering | Ve y edita todo menos OC |
| **Paula** (`contabilidad`) | Ve todo menos corrida; Finanzas; paga OC y anticipos con comprobante | Igual |
| **Monse y Kika** (`contenido`) | Suben imágenes a los formatos generales; ven la campaña | Suben imágenes a Checklist Auditorio |
| **Iliana** (`catering`) | Ve la información general; edita solo catering | Igual |
| **Practicantes** (`practicante`) | Studio, testigos de publicidad y calendario, por temporada | Testigos y calendario |

Los roles `gerente_arta`, `logistica`, `convenios`, `enlace_gobierno` y `solo_carpetas` se conservan para
quien ya los tenga; nadie del equipo actual debería llevarlos.

**El Auditorio no lleva corrida, campaña ni convenios** (`entityHasModule`): no salen ni como pestaña, ni en el
menú, ni en el API. Lo que ya existía queda en la base, sin borrar.

**La corrida** solo la ven Chacho, Arturo, Leida y Sol (`corrida.view`). El candado cubre el evento, los
archivos por id (`/uploads/:id/*`, `/files/:id/inline`), la papelera, las referencias del chat y la analítica.
Límite conocido: `/uploads/*` se sirve estático, así que quien ya tenga la URL del archivo puede abrirlo.

## Quién aprueba cada formato

- **Evento General, Artes de shows y Pendones** (`TOP_APPROVAL_FORMATS`, con `CUSTOM`, que es Pendones en
  Excel): basta uno de Chacho o Arturo.
- **Los demás de Arta:** también Leida y Sol.
- **Los de Auditorio:** Rodrigo, Chacho o Arturo.

La misma regla cubre el estado (aprobar, sellar, reabrir), la firma «Autorizado» y a quién le llega el aviso de
«listo para revisión». Quién los edita está en `canEditFormat`.

## Órdenes de compra

Las hace Juan Pablo (`po.edit`, ni dirección lo trae por su rol; `hasPermission` lo excluye a propósito y se
puede dar como permiso extra si él falta). Las autorizan Chacho o Arturo. Al autorizar una transferencia o un
adendum, el aviso `po.to_transfer` va a contabilidad, liga a `/purchase-orders?po=<id>`; Paula paga, sube el
comprobante y al quedar pagada se avisa también a quien autorizó.

**Adendum** es una forma de pago de la OC: persona, cuenta, monto (el total de la orden) e imagen o PDF. La
pestaña Adendum del evento y Finanzas los juntan; se crean y autorizan como cualquier OC.

## Lo nuevo por módulo

- **Orden de pestañas del evento:** Resumen, Corrida, Campaña, Formatos, OC, Convenios, Boletera, Tareas,
  Documentos, Adendum, Testigos de publicidad.
- **Boletera en Resumen:** `Event.boleteraUrl`, solo `https://`, embebida con `sandbox`. Una boletera puede
  negarse a salir embebida y el navegador no avisa, por eso «Abrir aparte» siempre está a la vista.
- **Testigos de publicidad:** `PublicityProof`, `/testigos/*`. Foto, archivo o liga por medio; `POST
  /testigos/event/:id/pdf` arma el archivo final. `isPublic` marca lo que puede usar el sitio.
- **Perfiles de practicante:** `/studio/practicantes`, `/practicantes`. Vencen con `User.accessExpiresAt`, que
  revisan el login y `jwt.strategy`: al vencer sale aunque tenga la sesión abierta. La contraseña se enseña una
  vez. Publicar lo da `studio.publish`, por perfil.
- **Finanzas:** `/finanzas`, `finanzas.view`. Por pagar, pagado, adendums, anticipos y por evento; exporta CSV.
- **Barra y Merch:** plantillas `BARRA` y `MERCH` en `format-catalog.ts`, solo Auditorio.

## Cambiar un rol en producción

El rol viaja en la sesión: al cambiarlo hay que revocar sesiones. `scripts/roles-clientes-2026-11.ts` deja a cada
persona con su rol, sus negocios y sin permisos sueltos, da de alta a Iliana y crea las plantillas nuevas. Es
idempotente. Las contraseñas nuevas salen a un archivo, nunca a la consola:

```bash
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/roles-clientes-2026-11.ts --dry
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/roles-clientes-2026-11.ts --out=/tmp/arta-accesos.txt
```

Las personas se buscan por nombre porque este repo es público: los correos no van aquí.
