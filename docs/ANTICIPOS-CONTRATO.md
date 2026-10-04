# Anticipos con aprobación — contrato (2026-10-04)

Pedido de Adam: los anticipos dejan de ser solo un registro. Flujo: **solicitar → aprobar o rechazar →
pagado**, con avisos en cada paso, en web y en las apps (pantalla Aprobaciones). Todo aditivo.

## Datos (Prisma)

Los anticipos siguen siendo `PaymentProof` con `purchaseOrderId = null`. Campos nuevos (todos opcionales):

```prisma
enum AdvanceStatus { PENDING APPROVED REJECTED PAID }

// en PaymentProof
advanceStatus  AdvanceStatus?
note           String?        // para qué es el anticipo
decidedById    String?        // quien aprobó o rechazó
decidedAt      DateTime?
rejectReason   String?
paidById       String?
paidAt         DateTime?
paidProofUrl   String?        // comprobante de pago (si el de la solicitud era otra cosa)
```

Migración `20261004170000_advance_approval` (solo aditiva). Los anticipos que ya existen
(`purchaseOrderId IS NULL`) quedan en `PAID` (se registraron con su comprobante). Los comprobantes de OC
quedan con `advanceStatus = NULL`.

## Permisos

- **Solicitar**: quien hoy puede registrar (`FINANCE_EDIT` o `FINANCE_VIEW`) y además `checklist.edit`
  (como entra hoy a `/advances`), sobre un evento abierto de su entidad.
- **Aprobar / rechazar**: quien tiene `PO_AUTHORIZE` en la entidad del evento (los mismos que autorizan OC).
  Nadie aprueba su propia solicitud.
- **Marcar pagado**: `PO_MARK_PAID` o `FINANCE_EDIT` en la entidad. Solo desde `APPROVED`.

## API (controlador de finanzas)

| Método | Ruta | Cuerpo | Efecto |
|---|---|---|---|
| POST | `/finance/advances` | `{ eventId, label?, amount, note?, fileUrl? }` (`fileUrl` ya no es obligatorio; `amount` sí) | crea en `PENDING` |
| GET | `/finance/advances/event/:eventId` | — | igual que hoy + campos nuevos, `uploadedBy`, `decidedBy`, `paidBy` (`{ id, fullName }`) |
| GET | `/finance/advances/pending` | — | lo que **yo** puedo resolver: `PENDING` si apruebo, `APPROVED` si pago; con `event { id, name, entity }` y `uploadedBy` |
| GET | `/finance/advances/mine` | — | mis solicitudes (todas), más recientes primero |
| PATCH | `/finance/advances/:id/approve` | — | `PENDING → APPROVED` |
| PATCH | `/finance/advances/:id/reject` | `{ reason }` (obligatorio, ≥3 caracteres) | `PENDING → REJECTED` |
| PATCH | `/finance/advances/:id/paid` | `{ proofUrl? }` | `APPROVED → PAID` |

Transición inválida → 409 con mensaje en español. Evento cerrado → igual que hoy (`assertEventNotClosed`).
Todo cambio queda en `auditLog`.

## Avisos (`NotificationsService.notify`, canal según `notification-push-meta.ts`)

| Tipo | A quién | Canal / prioridad | `linkUrl` |
|---|---|---|---|
| `advance.requested` | quienes aprueban | approvals / high | `/advances?advance=<id>` |
| `advance.approved` | quien solicitó | finance / normal | `/advances?advance=<id>` |
| `advance.to_pay` | quienes pagan | finance / high | `/advances?advance=<id>` |
| `advance.rejected` | quien solicitó (con el motivo en el cuerpo) | finance / high | `/advances?advance=<id>` |
| `advance.paid` | quien solicitó | finance / normal | `/advances?advance=<id>` |

`finance.advance` (aviso viejo de «registró un anticipo») se sustituye por `advance.requested`.
En las apps, `/advances?advance=<id>` con tipo `advance.requested` o `advance.to_pay` abre **Aprobaciones**
nativo (las apps ya mandan `/advances` + tipo pendiente a Aprobaciones; agregar estos dos tipos).

## Web

`/advances`: pestañas «Por resolver» (lo de `/pending`), «Mis solicitudes», «Por evento» (lo de hoy).
Formulario de solicitud (evento, concepto, monto, nota, archivo opcional). Tarjeta con estado (chip de color),
quién y cuándo decidió, motivo de rechazo, comprobante de pago. Acciones Aprobar / Rechazar (pide motivo) /
Marcar pagado (adjuntar comprobante opcional). `?advance=<id>` abre esa tarjeta.

## Apps (pantalla Aprobaciones)

Sección «Anticipos» con lo de `/finance/advances/pending`: tarjeta (evento, concepto, monto MXN, quién
pidió, nota, archivo) y Aprobar / Rechazar (hoja con motivo obligatorio) / Marcar pagado (adjuntar foto o
archivo opcional vía `POST /uploads` como ya hacen las tareas, si existe esa ruta; si no, sin adjunto).
En Inicio, el contador «Por aprobar» suma los anticipos.
