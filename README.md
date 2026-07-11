# ARTA-app

Operaciones de eventos para **arta PRODUCCIONES** y **Auditorio Arema · Explanada**.

## Stack

- Monorepo Turbo: `apps/web` (Next.js 14) + `apps/api` (NestJS + Prisma + Postgres)
- Auth JWT + RBAC por rol y entidad (`ARTA` | `EXPLANADA`)
- Studio CMS (sitio público solo Arta)
- Checklists con PDF + firmas digitales
- OC con partidas, autorización y pago
- Corrida financiera (edición + import Excel + sync checklist)
- Carpetas generales, portal vendor por PIN

## Arranque rápido (Docker)

```bash
docker compose up --build
```

- Web: http://localhost:3000  
- API: http://localhost:4000  
- Sitio Arta: http://localhost:3000/p/arta  
- Panel: http://localhost:3000/login  
- Postgres host: `localhost:5433` (user/pass/db `arta`)

Credenciales: `docs/ACCESS.md`.

## Arranque local (sin contenedores app)

```bash
cp .env.example apps/api/.env
# Edita SEED_PASS_* y DATABASE_URL

npm install
npm run local:setup   # migrate + seed
npm run dev
```

- Web: http://localhost:3000  
- API: http://localhost:4000  
- Sitio Arta: http://localhost:3000/p/arta  
- Panel: http://localhost:3000/login  
- Vendor portal: http://localhost:3000/v/{pinId}  

> Sitio público = **solo Arta**. Auditorio = panel (switch de entidad).

Credenciales: `docs/ACCESS.md`.

## Módulos listos

1. Login + switch Arta / Auditorio  
2. Eventos: meta editable, notas, cierre / cancel / reopen / delete  
3. Checklists + PDF + firmas + deep-link `?tab=checklists&checklist=`  
4. OC con partidas · autorizo → pagado · delete pendientes  
5. Corrida + import Excel + sync CORRIDA checklist  
6. Campaña (`dataJson`)  
7. Boletera CRUD  
8. Anticipos con comprobante  
9. Índices ops: Hospitality, Transport, Catering, RP, Artes, Pendones, Mantenimiento  
10. Carpetas generales (por entidad)  
11. PIN vendor / portal externo `/v/[pinId]`  
12. Mis tareas + patrocinios  
13. Studio + noticia pública  
14. Usuarios: crear / rol / entidades / reset pass / activar  
15. Plantillas: preview + activar + editor schema  
16. ACL Rodrigo: en ARTA solo carpetas (sin event ops)  
17. Historial / restaurar versiones de checklist  
18. Audit log (dirección)  
19. Lockout login persistente (DB)  
20. Historial / restaurar schema de plantillas  
21. Permisos extra por usuario (además del rol)  

## Roadmap opcional

- Sitio público Auditorio (descartado a propósito: solo panel)  

