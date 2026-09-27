import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { PrismaService } from '../common/prisma/prisma.service';

export type PushKind = 'chat' | 'event';

export type PushPayload = {
  title: string;
  body: string;
  /** Ruta del panel (/events/…, /chat?channel=…); la app la traduce a su pantalla. */
  url?: string | null;
  priority?: 'high' | 'normal';
  /** Canal de Android: chat, approvals, tasks, finance, events, general. */
  channel?: string;
  /** Tipo de dominio: chat.message, task.assigned, po.created… */
  type?: string;
  /** chat = se apila por conversación como WhatsApp; event = aviso de proceso. */
  kind?: PushKind;
  /** Reemplaza el aviso anterior con la misma etiqueta (un evento = una tarjeta). */
  tag?: string;
  notificationId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  /** Conversación o entidad que agrupa los avisos. */
  threadId?: string | null;
  /** Nombre del grupo en canales; vacío en directos. */
  threadTitle?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  /** Número para el globo del ícono (iOS). */
  badge?: number | null;
  /** Sin alerta: sincroniza el teléfono (p. ej. quitar avisos de un chat ya leído). */
  silent?: boolean;
};

/** Errores de FCM que significan que el token ya no sirve (app desinstalada o reinstalada). */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Envío push a los teléfonos de una persona (FCM para Android e iOS).
 *
 * Android recibe solo `data` con prioridad alta: así la app SIEMPRE dibuja el aviso
 * (primer plano, fondo o cerrada) con su canal, remitente y conversación, como WhatsApp.
 * iOS muestra el `alert` de APNs y agrupa por `thread-id`.
 *
 * Sin `FIREBASE_SERVICE_ACCOUNT_JSON` no falla: solo no envía (el socket sigue avisando).
 */
@Injectable()
export class PushDispatchService {
  private readonly logger = new Logger(PushDispatchService.name);
  private initTried = false;
  private ready = false;

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return this.init();
  }

  private init(): boolean {
    if (this.initTried) return this.ready;
    this.initTried = true;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (!raw) {
      this.logger.log('Push FCM apagado (sin FIREBASE_SERVICE_ACCOUNT_JSON)');
      return false;
    }
    try {
      if (!admin.apps.length) {
        // JSON tal cual o en base64 (sin comillas ni saltos que el .env pueda romper).
        const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json) as admin.ServiceAccount) });
      }
      this.ready = true;
    } catch (e) {
      this.logger.warn(`FCM no disponible: ${e instanceof Error ? e.message : String(e)}`);
    }
    return this.ready;
  }

  /** Datos tal como los recibe el teléfono (FCM `data`, todo string). */
  buildData(payload: PushPayload): Record<string, string> {
    const kind = payload.kind || 'event';
    const tag = payload.tag || (payload.notificationId ? `arta-${payload.notificationId}` : `arta-${Date.now()}`);
    return {
      title: payload.title,
      body: payload.body,
      url: payload.url || '',
      priority: payload.priority || 'normal',
      channel: payload.channel || (kind === 'chat' ? 'chat' : 'general'),
      type: payload.type || '',
      kind,
      tag,
      notification_id: payload.notificationId || '',
      sender_id: payload.senderId || '',
      sender_name: payload.senderName || '',
      thread_id: payload.threadId || tag,
      thread_title: payload.threadTitle || '',
      channel_id: payload.channelId || '',
      message_id: payload.messageId || '',
      badge: payload.badge != null ? String(payload.badge) : '',
      sent_at: new Date().toISOString(),
    };
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.init()) return 0;
    const rows = await this.prisma.userPushEndpoint.findMany({
      where: { userId, fcmToken: { not: null } },
      select: { id: true, fcmToken: true },
    });
    if (rows.length === 0) return 0;

    const data = this.buildData(payload);
    const isChat = data.kind === 'chat';
    let sent = 0;
    for (const row of rows) {
      const token = row.fcmToken as string;
      try {
        if (payload.silent) {
          await admin.messaging().send({
            token,
            data: { ...data, silent: '1' },
            android: { priority: 'normal' },
            apns: {
              headers: { 'apns-priority': '5', 'apns-push-type': 'background' },
              payload: {
                aps: { contentAvailable: true, ...(payload.badge != null ? { badge: payload.badge } : {}) },
              },
            },
          });
          sent += 1;
          continue;
        }
        await admin.messaging().send({
          token,
          data,
          android: {
            priority: 'high',
            // En chat cada mensaje cuenta: sin collapseKey FCM no descarta pendientes.
            ...(isChat ? {} : { collapseKey: data.tag }),
          },
          apns: {
            headers: {
              'apns-priority': payload.priority === 'normal' && !isChat ? '5' : '10',
              'apns-push-type': 'alert',
              'apns-collapse-id': isChat ? undefined : data.tag.slice(0, 64),
            } as Record<string, string>,
            payload: {
              aps: {
                alert: { title: payload.title, body: payload.body },
                sound: 'default',
                threadId: data.thread_id,
                category: isChat ? 'ARTA_CHAT' : 'ARTA_EVENT',
                mutableContent: true,
                ...(payload.badge != null ? { badge: payload.badge } : {}),
              },
            },
          },
        });
        sent += 1;
      } catch (e) {
        const code = (e as { code?: string } | null)?.code || '';
        const tail = token.slice(-8);
        if (DEAD_TOKEN_CODES.has(code)) {
          await this.prisma.userPushEndpoint.delete({ where: { id: row.id } }).catch(() => undefined);
          this.logger.log(`Token …${tail} ya no existe (${code}); eliminado`);
        } else {
          this.logger.warn(`FCM falló token …${tail}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    return sent;
  }
}
