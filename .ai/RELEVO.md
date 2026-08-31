# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-31
- **Rama:** main

## Hecho en este turno

**Usuarios CRUD dinámico (solo Directores Generales Arturo / José Luis):**

1. **API** (`users.controller`): create con permisos opcionales; PATCH email/nombre/cargo/rol/entidades/activo/password/permisos; sync `orgMembership`; revoca sesiones al cambiar password o desactivar; **DELETE** = soft-delete (`active: false`) + sesiones + auditLog; no auto-eliminarse ni tocar `super_admin` sin serlo; catálogo de roles oculta `super_admin` a no–super_admin.
2. **UI** `/users`: gate `users.manage` / dir_general; crear o invitar; directorio con Editar/Eliminar; panel editar completo (datos + entidades + activo + password opcional + permisos extra); mensaje «Solo dirección» si no aplica.

## A medias

Nada (pendiente deploy + smoke en prod).

## Siguiente paso

1. Deploy Hetzner + hard-refresh Arturo/José Luis en `/users`.
2. Smoke: crear usuario, editar rol/entidades, eliminar (desactivar), verificar que logística no ve el menú.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
