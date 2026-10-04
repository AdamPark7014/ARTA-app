import { api } from '@/lib/api';

/**
 * Avisos push en el navegador (FCM web). Reusa el mismo envío del API que
 * Android/iOS: el token se registra en /devices/push con plataforma `web`.
 *
 * Sin las variables NEXT_PUBLIC_FIREBASE_* todo se apaga y la UI se oculta.
 */

// Next solo incrusta NEXT_PUBLIC_* con acceso literal; no leer process.env dinámicamente.
const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';

const SW_URL = '/firebase-messaging-sw.js';
// Alcance raíz: el SW debe controlar las pestañas para poder navegarlas al tocar un aviso.
// No tiene `fetch`, así que no intercepta peticiones. Si algún día hay otro SW, unirlos aquí.
const SW_SCOPE = '/';

const TOKEN_KEY = 'arta_webpush_token';
const OPT_OUT_KEY = 'arta_webpush_off';
const PROMPT_KEY = 'arta_webpush_prompt';

export type WebPushStatus =
  /** Falta configuración o es la app nativa: no se muestra nada. */
  | 'hidden'
  /** Navegador sin soporte de push. */
  | 'unsupported'
  /** iPhone/iPad en Safari sin instalar: hay que agregarla a la pantalla de inicio. */
  | 'needs-install'
  /** La persona bloqueó los avisos en el navegador. */
  | 'denied'
  | 'enabled'
  | 'disabled';

export function webPushConfigured(): boolean {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
      FIREBASE_CONFIG.projectId &&
      FIREBASE_CONFIG.messagingSenderId &&
      FIREBASE_CONFIG.appId &&
      VAPID_KEY,
  );
}

export function isNativeAppWebView(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('ArtaApp/');
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* modo privado */
  }
}

let supportCache: Promise<boolean> | null = null;

async function browserSupportsPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
    return false;
  }
  if (!supportCache) {
    supportCache = import('firebase/messaging')
      .then((m) => m.isSupported())
      .catch(() => false);
  }
  return supportCache;
}

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (typeof window === 'undefined' || !webPushConfigured() || isNativeAppWebView()) return 'hidden';
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!(await browserSupportsPush())) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && readLocal(TOKEN_KEY) && readLocal(OPT_OUT_KEY) !== '1') {
    return 'enabled';
  }
  return 'disabled';
}

async function messagingInstance() {
  const [{ initializeApp, getApps }, messaging] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ]);
  const app = getApps().find((a) => a.name === 'arta-web-push') || initializeApp(FIREBASE_CONFIG, 'arta-web-push');
  return { messaging: messaging.getMessaging(app), mod: messaging };
}

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  if (reg.active) return reg;
  const worker = reg.installing || reg.waiting;
  if (worker) {
    await new Promise<void>((resolve) => {
      const done = () => {
        if (worker.state === 'activated') {
          worker.removeEventListener('statechange', done);
          resolve();
        }
      };
      worker.addEventListener('statechange', done);
      done();
    });
  }
  return reg;
}

function describeBrowser(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador';
  const os = isIos()
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return `${browser}${os ? ` · ${os}` : ''}${isStandalone() ? ' (app)' : ''}`;
}

async function obtainAndRegisterToken(): Promise<string> {
  const reg = await activeRegistration();
  const { messaging, mod } = await messagingInstance();
  const token = await mod.getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new Error('El navegador no entregó un token de avisos');
  await api('/devices/push', {
    method: 'POST',
    body: JSON.stringify({ token, platform: 'web', deviceName: describeBrowser() }),
  });
  writeLocal(TOKEN_KEY, token);
  return token;
}

/**
 * Pide permiso y registra este navegador. Debe llamarse directo desde un clic:
 * Safari exige que `requestPermission` ocurra dentro del gesto del usuario.
 */
export async function enableWebPush(): Promise<WebPushStatus> {
  if (!webPushConfigured() || isNativeAppWebView()) return 'hidden';
  if (typeof Notification === 'undefined') return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  const permission = await Notification.requestPermission();
  writeLocal(PROMPT_KEY, 'done');
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'disabled';
  if (!(await browserSupportsPush())) return 'unsupported';
  writeLocal(OPT_OUT_KEY, null);
  await obtainAndRegisterToken();
  return 'enabled';
}

async function removeTokenFromApi(token: string, timeoutMs?: number) {
  const ctrl = timeoutMs ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    // Siempre con token: DELETE sin token borra TODOS los teléfonos de la persona.
    await api('/devices/push', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
      signal: ctrl?.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Baja de este navegador: deja de recibir avisos aunque el permiso siga concedido. */
export async function disableWebPush(): Promise<WebPushStatus> {
  writeLocal(OPT_OUT_KEY, '1');
  writeLocal(PROMPT_KEY, 'done');
  const token = readLocal(TOKEN_KEY);
  writeLocal(TOKEN_KEY, null);
  if (token) await removeTokenFromApi(token).catch(() => undefined);
  try {
    const { messaging, mod } = await messagingInstance();
    await mod.deleteToken(messaging);
  } catch {
    /* sin suscripción previa */
  }
  return getWebPushStatus();
}

/**
 * Al iniciar sesión con permiso ya concedido: vuelve a registrar el token
 * (puede haber rotado, o este navegador era de otra persona).
 */
export async function syncWebPush(): Promise<void> {
  if (!webPushConfigured() || isNativeAppWebView()) return;
  if (readLocal(OPT_OUT_KEY) === '1') return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!(await browserSupportsPush())) return;
  await obtainAndRegisterToken();
}

/** Antes de cerrar sesión: el token deja de ser de esta persona. No bloquea más de 1.5 s. */
export async function unregisterWebPushOnLogout(): Promise<void> {
  const token = readLocal(TOKEN_KEY);
  if (!token) return;
  writeLocal(TOKEN_KEY, null);
  await removeTokenFromApi(token, 1500).catch(() => undefined);
}

export function webPushPromptDismissed(): boolean {
  return readLocal(PROMPT_KEY) !== null || readLocal(OPT_OUT_KEY) === '1';
}

export function dismissWebPushPrompt() {
  writeLocal(PROMPT_KEY, 'dismissed');
}
