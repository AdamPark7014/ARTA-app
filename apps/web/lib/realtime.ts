'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { hasSessionHint } from '@/lib/api';

/**
 * Tiempo real del navegador: el mismo Socket.IO que usan las apps nativas.
 *
 * Una sola conexión por pestaña, autenticada con la cookie `arta_access`
 * (Traefik quita `/api`, igual que en HTTP). Las salas de canal se recuerdan
 * y se vuelven a pedir tras cada reconexión.
 */

let socket: Socket | null = null;
const joined = new Set<string>();
const statusListeners = new Set<(connected: boolean) => void>();

function presence(s: Socket) {
  s.emit('chat:presence', { status: document.hidden ? 'away' : 'online' });
}

function ensureSocket(): Socket | null {
  if (typeof window === 'undefined' || !hasSessionHint()) return null;
  if (socket) {
    if (!socket.connected && !socket.active) socket.connect();
    return socket;
  }
  const s = io({
    path: '/api/socket.io',
    withCredentials: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 15_000,
  });
  s.on('connect', () => {
    for (const id of joined) s.emit('chat:join', { channelId: id });
    presence(s);
    statusListeners.forEach((fn) => fn(true));
  });
  s.on('disconnect', () => statusListeners.forEach((fn) => fn(false)));
  document.addEventListener('visibilitychange', () => {
    if (s.connected) presence(s);
  });
  socket = s;
  return s;
}

export function joinChannel(channelId: string) {
  joined.add(channelId);
  const s = ensureSocket();
  if (s?.connected) s.emit('chat:join', { channelId });
}

export function leaveChannel(channelId: string) {
  joined.delete(channelId);
  if (socket?.connected) socket.emit('chat:leave', { channelId });
}

export function sendTyping(channelId: string) {
  if (socket?.connected) socket.emit('chat:typing', { channelId });
}

/** Escucha un evento del servidor mientras el componente está montado. */
export function useRealtime<T = unknown>(event: string, handler: (payload: T) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const s = ensureSocket();
    if (!s) return;
    const fn = (payload: T) => ref.current(payload);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event, enabled]);
}

/**
 * Estado de la conexión. `onReconnect` corre cada vez que conecta (la primera
 * y tras un corte): ahí se piden de nuevo los datos que pudieron llegar sin socket.
 */
export function useRealtimeStatus(onReconnect?: () => void, enabled = true): boolean {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onReconnect);
  cb.current = onReconnect;
  useEffect(() => {
    if (!enabled) return;
    const s = ensureSocket();
    if (!s) return;
    let wasConnected = s.connected;
    setConnected(s.connected);
    const fn = (up: boolean) => {
      setConnected(up);
      if (up && !wasConnected) cb.current?.();
      wasConnected = up;
    };
    statusListeners.add(fn);
    return () => {
      statusListeners.delete(fn);
    };
  }, [enabled]);
  return connected;
}
