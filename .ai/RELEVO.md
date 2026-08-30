# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** main

## Contexto del proyecto

ERP de producción de eventos **en producción real** (artaproducciones.com,
Hetzner `5.78.215.109:2222`, stack docker `arta`). NestJS + Prisma (`apps/api`)
y Next 14 App Router (`apps/web`), monorepo npm workspaces + turbo.

## Hecho en este turno

**P1 eficiencia del panel** (pedido: continuar el sitio «mega eficiente»).

### Qué se hizo

1. **Ctrl/⌘+S** en hoja, PDF anotado, documento Word, checklist y corrida
   (`lib/use-save-hotkey.ts`).
2. **ExpandBox** confirma al salir (Esc) si hay cambios sin guardar; DocEditor
   también va a pantalla completa por defecto.
3. **Campaña / Archivos** — un clic primario a editar; empty states con CTA;
   «Nueva hoja de gastos» abre el Excel recién creado.
4. **Finanzas / Usuarios / Seguridad** — copy en español; restablecer
   contraseña inline (sin `prompt`); KPI alto riesgo filtra; revocar todas las
   sesiones; enlaces útiles.

### Verificación

- `npx tsc --noEmit` en `apps/web` verde.

## Decisiones de diseño que hay que respetar

- Checklists sobre PDF, ExpandBox, menú auto, pdffield CSS.
- Campaña: editar tabla en Excel; PDF = vista/anotación.
- No regenerar checklists autorizados en bloque.
- Seed no pisa `passwordHash` en update.

## A medias — CUIDADO

- Deploy de este turno (P1 eficiencia).
- Deploy key GitHub; P1 Playwright; guía HTML menú nuevo; Traefik causa raíz.

## Siguiente paso

1. Deploy + smoke: Campaña → Editar hoja → Ctrl+S; Esc con dirty; Usuarios
   restablecer inline; Seguridad «Revocar todas».
2. Playwright hub (Campaña + OC + ExpandBox Esc).
3. Actualizar guía HTML al menú nuevo.

## No tocar

- `docs/ACCESS.md`, `output: 'standalone'`, e2e API BD, `.env.arta`.
