# Chat: reportar mensajes y bloquear personas

Apple (guía 1.2, contenido generado por usuarios) exige en apps con chat: reportar contenido ofensivo,
bloquear a usuarios abusivos y que el desarrollador actúe sobre los reportes (en menos de 24 h). App Review
lo pidió al rechazar la 1.0.0 (06-10-2026). Este documento es el contrato entre API, iOS y Android.

## API (`apps/api`, módulo `chat`)

### Modelos (Prisma)

```prisma
model ChatUserBlock {
  blockerId String
  blocker   User     @relation("ChatBlocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blockedId String
  blocked   User     @relation("ChatBlocked", fields: [blockedId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@id([blockerId, blockedId])
  @@index([blockedId])
}

model ChatReport {
  id             String       @id @default(cuid())
  organizationId String?
  reporterId     String       // relación "ChatReportsMade", onDelete Cascade
  messageId      String?      // relación a ChatMessage, onDelete SetNull
  reportedUserId String?      // relación "ChatReportsReceived", onDelete SetNull
  reason         String       // SPAM | ACOSO | OFENSIVO | OTRO
  details        String?      // máx. 1000
  status         String       @default("OPEN") // OPEN | RESOLVED
  createdAt      DateTime     @default(now())
  resolvedAt     DateTime?
  resolvedById   String?

  @@index([organizationId, status, createdAt])
}
```

Migración aditiva nueva en `prisma/migrations/` (solo `CREATE TABLE` + índices + FKs).

### Endpoints (todos bajo `/api/chat`, con sesión)

| Método y ruta | Cuerpo | Respuesta | Reglas |
| --- | --- | --- | --- |
| `POST /chat/messages/:id/report` | `{ "reason": "SPAM"\|"ACOSO"\|"OFENSIVO"\|"OTRO", "details"?: string }` | `201 { "ok": true, "reportId": "…" }` | Debe poder ver el canal del mensaje. No se reporta un mensaje propio (400). Avisa a los moderadores de la organización (roles de dirección y quien administra el canal) con un aviso «Reporte en el chat». |
| `POST /chat/users/:userId/block` | — | `201 { "ok": true }` | Misma organización; no a sí mismo (400). Idempotente. |
| `DELETE /chat/users/:userId/block` | — | `200 { "ok": true }` | Idempotente. |
| `GET /chat/blocks` | — | `200 [{ "id", "name", "avatarUrl"?, "blockedAt" }]` | Las personas que YO bloqueé. |
| `GET /chat/reports?status=OPEN` | — | `200 [{ "id","reason","details","status","createdAt","reporter":{id,name},"reportedUser":{id,name}?,"message":{id,body,channelId,channelName}? }]` | Solo moderadores (dirección / super_admin). |
| `PATCH /chat/reports/:id` | `{ "status": "RESOLVED" }` | `200 { "ok": true }` | Solo moderadores. |

### Efectos del bloqueo

- Quien bloquea deja de ver los mensajes de la persona bloqueada en: mensajes de canal, hilos, fijados,
  guardados y búsqueda (`senderId notIn bloqueados`).
- Mensajes directos: si existe bloqueo en cualquier dirección, `POST /chat/dm` y enviar en un canal
  `DIRECT` entre ambos responden `403 "No puedes enviar mensajes a esta persona"`.
- Sin avisos ni push para quien bloqueó por mensajes de la persona bloqueada.

## Apps (iOS y Android): misma experiencia

- **Menú de un mensaje ajeno** (pulsación larga): «Reportar» → hoja con 4 motivos (Spam · Acoso o
  intimidación · Contenido ofensivo o inapropiado · Otro) + texto opcional → `POST …/report` → aviso
  «Gracias. Un administrador lo revisará en menos de 24 horas.»
- **En el mismo menú**: «Bloquear a {nombre}» → confirmación «No verás sus mensajes y no podrá escribirte
  por mensaje directo. Puedes desbloquearlo en Más › Usuarios bloqueados.» → `POST …/block` → sus
  mensajes desaparecen de la pantalla actual.
- **Conversación directa**: en el menú del encabezado, «Bloquear» / «Desbloquear».
- **Más › Usuarios bloqueados**: lista (`GET /chat/blocks`) con «Desbloquear».
- Tiempo real: se ignoran los mensajes entrantes de personas bloqueadas (la app carga `GET /chat/blocks`
  al entrar al chat).
- Modo demo (capturas): `GET /chat/blocks` sin fixture → lista vacía; los POST/DELETE responden `ok`.
