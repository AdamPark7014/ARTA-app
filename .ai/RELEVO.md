# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

**Polish UX editores embebidos (sin commit — padre cierra).**

1. **`globals.scss`**: sheet-chrome / toolbar / fxbar (espaciado, focus rings, wrap móvil ≤640px); `editor-coach`; file-create cards (focus-visible, gaps); docedit paper/bar/chips focus + toolbar wrap ≤720px.
2. **`SheetEditor`**: coach dismissible (`sessionStorage` `arta-sheet-coach`): «Edita celdas → Guardar → Salir en PDF».
3. **`DocEditor`**: mismo patrón (`arta-doc-coach`): «Escribe → Guardar → Salir en PDF».
4. APIs/props sin cambios. Sin deploy.

## A medias

Nada de este alcance (falta commit del padre).

## Siguiente paso

1. Commit del polish (padre).
2. Hard-refresh: abrir hoja y doc — coach una vez por sesión; toolbars en viewport estrecho.
3. Deploy producto ARTA cuando Adam lo pida.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña (tabla precio interno/externo): no romper al tocar Excel.
