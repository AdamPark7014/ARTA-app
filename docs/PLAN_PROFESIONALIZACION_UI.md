# Plan de profesionalización e intuitividad — ARTA Ops

**Fecha:** 2026-08-29 · **Origen:** junta 28-08 (`Correciones Dashboard ARTA.pdf`),
pedidos de documentos editables (29-08), ver/editar en grande y menú tipo Mac,
más el relevo de Claude Code.

Este documento es el mapa de qué ya está, qué falta y en qué orden se cierra
para que el panel se sienta **profesional e intuitivo** de punta a punta.

---

## 0. Principios (no negociables)

1. **El documento manda.** PDF, Excel y checklist se leen y editan a tamaño de
   trabajo (pantalla completa o columna ancha), no en miniaturas.
2. **Un menú limpio.** Sidebar = Inicio · Eventos · Marca · Admin (+ Carpetas /
   OC según rol). El resto vive **dentro del evento** o en «Más herramientas».
3. **Sin sorpresas destructivas.** No reescribir en bloque PDFs ya autorizados;
   no pisar contraseñas en deploy; avisos que fallan no tumban la operación.
4. **Nexara ≠ Arta.** Contenedores, BD y volúmenes separados. Solo se comparte
   Traefik/`proxy`; `arta.yml` se restaura con cron si Nexara lo borra.
5. **Disco y git mandan** sobre la memoria del agente (protocolo de relevo).

---

## 1. Gap analysis — junta 28-08 + pedidos 29-08

| Pedido | Estado | Notas |
| ------ | ------ | ----- |
| Sidebar sin desglose de checks | ✅ | + «Más herramientas» + buscador |
| Crear / actuales / pasados / Tareas | ✅ | `/events?scope=` |
| Campaña Excel/PDF embebidos | ✅ | `module=campaign` + FileViewer |
| Ventana OC configurable | ✅ | `/settings` + banner + 403 |
| Tareas org-wide + notificación | ✅ | Campana topbar |
| Altas Monse/Marisol/Kika · baja Melissa | ✅ | Confirmar apellidos Monse/Kika |
| Documentos editables (xlsx/PDF/doc) | ✅ | Límites en `DOCUMENTOS_EDITABLES.md` |
| Checklist captura **sobre** el PDF | ✅ | 59/80 backfill; 21 firmados intactos |
| Ver/editar **en grande** | 🟡 | ExpandBox existe; falta abrir grande por defecto y workspace alto inline |
| Menú auto-hide tipo Mac | 🟡 | Existe pero es opt-in; falta default sensato + hint en borde |
| Finance / Users / Security polish | ✅ | Copy ES + CTAs (2026-08-29) |
| Playwright hub (Campaña + OC) | ✅ | `e2e/hub-critical.spec.ts` (mock API) |
| Guía de uso con menú nuevo | ✅ | Sidebar + ExpandBox + Ctrl+S + campaña Excel |
| Deploy key GitHub en server | ❌ | Operativo Adam |
| Traefik: causa raíz Nexara | 🟡 | Cron + docs hook post-deploy; falta aplicar hook en Nexara |
| A3-5 módulos (inventario, calendario, reportes) | ❌ | Un módulo a la vez, sin CRUD fuera del spine |
| ENTERPRISE_ITERATION_W2.md | ❌ | Doc pendiente |

---

## 2. Fases de implementación

### Fase P0 — Intuitividad inmediata (este turno)

**Estado:** implementada en el turno Cursor 2026-08-29.

**Objetivo:** que Arturo abra un checklist/PDF y trabaje a tamaño real sin
buscar el botón «Ampliar»; que el menú se esconda como en Mac sin tutorial.

| ID | Trabajo | Criterio de hecho |
| -- | ------- | ----------------- |
| P0-1 | `ExpandBox` con `defaultExpanded` en ChecklistPdfEditor, PdfEditor, SheetEditor, FileViewer | ✅ Al abrir documento, pantalla completa (Esc / Salir) |
| P0-2 | Workspace inline alto (`expandbox--inline`) | ✅ Columna ≥ ~70vh |
| P0-3 | Menú automático **activo por defecto en desktop** (≥901px) | ✅ Preferencia en `localStorage` |
| P0-4 | Hint en topbar + «Fijar menú» | ✅ |
| P0-5 | Checklist hub: hint pantalla completa + guardar | ✅ |

### Fase P1 — Profesionalismo del panel (siguiente turno corto)

| ID | Trabajo | Estado |
| -- | ------- | ------ |
| P1-1 | Auditoría visual finance / users / security (Fase A 6–7) | ✅ Copy ES + CTAs (2026-08-29) |
| P1-2 | Empty states + copy unificados en hub de evento | ✅ Campaña / archivos / corrida |
| P1-3 | Specs Playwright: Campaña expandida + ventana OC + ExpandBox Esc | ✅ `hub-critical.spec.ts` |
| P1-4 | Actualizar `docs/guides/ARTA-Ops-Guia-de-Uso.html` al menú nuevo | ✅ |

**Extra P1 (eficiencia diaria):** Ctrl/⌘+S; Esc dirty; campaña/archivos un clic;
DocEditor ExpandBox; password inline; revocar sesiones.

**Extra hardening (2026-08-30):** no regenerar PDFs firmados desde boletera;
seed no pisa ACL; flash error/success en hub; try/catch mutaciones; healthchecks
compose + backup/rollback; OC nav sin `checklist.edit`; docs Traefik/Nexara.

**Hosts polish (2026-08-30):** nav/títulos 100 % ES; wordmark EXPLANADA a la par;
sitio público sin teléfono falso + stats de marca; Studio/preview ES; portal PIN
y login/invite en español formal (Proveedor). Desplegado a los 3 hosts.

### Fase P2 — Operación y escala

| ID | Trabajo | Estado |
| -- | ------- | ------ |
| P2-1 | Deploy key en Hetzner → `update.sh` con `git pull` | ❌ Adam |
| P2-2 | Hook post-deploy Nexara que no borre `arta.yml` (o lo restaure) | 🟡 Doc + cron; falta hook Nexara |
| P2-3 | Confirmar roster Monse/Kika; entregar credenciales (fuera de repo) | ❌ |
| P2-4 | Backfill `--include-signed` **solo si Adam lo pide** | ❌ |
| P2-5 | A3-5 un módulo operativo (calendario o inventario), sin CRUD paralelo | ❌ |

### Fase P3 — Enterprise

| ID | Trabajo |
| -- | ------- |
| P3-1 | `docs/ENTERPRISE_ITERATION_W2.md` |
| P3-2 | Reportes ejecutivos (lectura sobre analytics ya existentes) |
| P3-3 | App nativa (fuera de este plan web) |

---

## 3. Qué NO hacer en P0

- No regenerar los 21 checklists ya autorizados.
- No tocar `docs/ACCESS.md`, `output: 'standalone'`, ni e2e de API contra BD.
- No meter CRUD nuevo fuera del spine del evento.
- No reescribir archivos enteros que no se hayan leído en la sesión.

---

## 4. Verificación P0

- `npx tsc --noEmit` en `apps/web` (y api si se tocó).
- Abrir checklist con `pdfFieldsJson`: campos legibles a pantalla completa;
  Esc sale sin perder borrador.
- Desktop: menú oculto; cursor a la izquierda → menú; salir → se esconde.
- Móvil: hamburguesa manda (auto-hide no pelea).
