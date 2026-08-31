# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-31
- **Rama:** main

## Hecho en este turno

**Usuarios — alta más usable para Arturo/José Luis + huecos CRUD:**

1. **Alta inmediata:** tabs Alta / Invitar; rol con hint; entidades auto según rol; password generado + ver/copiar; permisos extra opcionales; tarjeta post-alta con panel/email/clave para copiar.
2. **API:** reactivar si el email estaba dado de baja; `unlock` limpia bloqueo login; roles con hint/defaultEntities; permisos en español (`PERMISSION_LABELS` / `ROLE_HINTS`).
3. **Directorio:** filtro por rol; Reactivar / Desbloquear; invitaciones pendientes + revocar.

## A medias

Nada (pendiente deploy).

## Siguiente paso

1. Deploy + hard-refresh Arturo en `/users`.
2. Smoke: Alta inmediata → copiar credenciales; Invitar; Reactivar baja; Desbloquear.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
