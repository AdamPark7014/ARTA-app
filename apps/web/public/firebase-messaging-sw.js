/* eslint-disable no-restricted-globals */
/**
 * Service worker de avisos push del navegador (FCM web).
 *
 * No carga el SDK de Firebase: FCM entrega el push con `{ data: {...} }` en JSON
 * y aquí se dibuja la notificación con los mismos campos que usa la app nativa
 * (title, body, url, tag, kind, channel, thread_id, badge, silent).
 * Así no depende de un CDN ni necesita la configuración del proyecto.
 */

const ICON = '/icons/icon-192.png';
const BADGE = '/icons/badge-96.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return null;
  try {
    const json = event.data.json();
    // FCM: data-only llega en `data`; si algún día llega `notification`, se usa como respaldo.
    const data = Object.assign({}, json && json.data);
    if (json && json.notification) {
      if (!data.title) data.title = json.notification.title || '';
      if (!data.body) data.body = json.notification.body || '';
    }
    return data;
  } catch (e) {
    return { title: 'ARTA', body: event.data.text() };
  }
}

function isSafari() {
  const ua = self.navigator.userAgent || '';
  return /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(ua);
}

async function setBadge(raw) {
  if (raw === undefined || raw === null || raw === '') return;
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  try {
    if (n > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
    else if (n <= 0 && self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch (e) {
    /* sin soporte de globo */
  }
}

async function closeByTag(tag) {
  if (!tag) return;
  const list = await self.registration.getNotifications({ tag });
  list.forEach((n) => n.close());
}

async function hasFocusedClient() {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return list.some((c) => c.focused && c.visibilityState === 'visible');
}

/** El botón del aviso dice qué sigue. */
function actionLabel(data) {
  if (data.channel === 'approvals') return 'Revisar';
  if (data.channel === 'tasks') return 'Ver tarea';
  if (data.channel === 'finance') return 'Ver detalle';
  return 'Abrir';
}

/** Los botones que el servidor eligió para este caso de uso (`pushActionsFor`). */
const ACTION_TITLE = {
  'task.deliver': 'Entregar',
  'task.approve': 'Revisar entrega',
  review: 'Revisar',
  reply: 'Responder',
};

function actionsOf(data, isChat) {
  const wanted = (data.actions || '').split(',').filter(Boolean);
  if (wanted.length) {
    return wanted.slice(0, 2).map((action) => ({ action, title: ACTION_TITLE[action] || actionLabel(data) }));
  }
  if (isChat) return [{ action: 'open', title: 'Abrir chat' }];
  return data.url ? [{ action: 'open', title: actionLabel(data) }] : [];
}

async function handlePush(data) {
  await setBadge(data.badge);

  // Sincronización (p. ej. chat leído en otro equipo): quitar los avisos de esa etiqueta.
  if (data.silent === '1' || data.silent === 'true') {
    await closeByTag(data.tag);
    return;
  }

  // Con el panel abierto y enfocado el socket ya avisa dentro de la app.
  // Safari revoca la suscripción si un push no muestra notificación: ahí siempre se muestra.
  if (!isSafari() && (await hasFocusedClient())) return;

  const isChat = data.kind === 'chat';
  const tag = data.tag || (isChat && data.thread_id ? `chat-${data.thread_id}` : undefined);
  let body = data.body || '';
  if (isChat && data.thread_title && data.sender_name) {
    body = `${data.sender_name}: ${body}`;
  }
  const title = (isChat && data.thread_title) || data.title || 'ARTA';

  await self.registration.showNotification(title, {
    body,
    tag,
    // Chat: cada mensaje nuevo vuelve a sonar aunque reemplace la tarjeta de la conversación.
    renotify: Boolean(tag) && isChat,
    icon: ICON,
    badge: BADGE,
    lang: 'es-MX',
    timestamp: data.sent_at ? Date.parse(data.sent_at) || Date.now() : Date.now(),
    requireInteraction: data.priority === 'high' && data.channel === 'approvals',
    // Lo que no espera a nadie entra a la bandeja sin sonar.
    silent: data.passive === '1',
    actions: actionsOf(data, isChat),
    data: {
      url: data.url || '/notifications',
      kind: data.kind || 'event',
      channel: data.channel || 'general',
      notificationId: data.notification_id || '',
      targetKind: data.target_kind || '',
      targetId: data.target_id || '',
    },
  });
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  if (!data) return;
  event.waitUntil(handlePush(data));
});

function targetUrl(raw) {
  try {
    const url = new URL(raw || '/notifications', self.location.origin);
    // Solo rutas del mismo origen: el payload no debe abrir sitios externos.
    if (url.origin !== self.location.origin) return new URL('/notifications', self.location.origin).href;
    return url.href;
  } catch (e) {
    return new URL('/notifications', self.location.origin).href;
  }
}

async function openOrFocus(href) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const exact = list.find((c) => c.url === href);
  if (exact) return exact.focus();
  const sameOrigin = list.find((c) => new URL(c.url).origin === self.location.origin);
  if (sameOrigin) {
    try {
      const focused = await sameOrigin.focus();
      if ('navigate' in focused) return await focused.navigate(href);
      return focused;
    } catch (e) {
      /* el cliente no se deja navegar: se abre ventana nueva */
    }
  }
  return self.clients.openWindow(href);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  // `?notif=<id>`: la campana lo marca leído al llegar (aquí no hay sesión para hacerlo).
  // «Entregar» y «Revisar entrega» van a la tarea aunque el aviso abra una conversación.
  const onTask = info.targetKind === 'task' && info.targetId && (event.action === 'task.deliver' || event.action === 'task.approve');
  const url = new URL(
    onTask ? targetUrl(`/tasks?task=${encodeURIComponent(info.targetId)}${event.action === 'task.deliver' ? '&do=deliver' : ''}`) : targetUrl(info.url),
  );
  if (info.notificationId) url.searchParams.set('notif', info.notificationId);
  const href = url.href;
  event.waitUntil(openOrFocus(href));
});
