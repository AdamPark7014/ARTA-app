'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AutosaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

type Options<T> = {
  /** Valor vivo del formulario. */
  value: T;
  /** false = solo lectura o evento cerrado: no se guarda nada. */
  enabled: boolean;
  /** Guardado silencioso (sin regenerar PDF ni crear versión). */
  save: (value: T) => Promise<void>;
  /** Inactividad antes de guardar. */
  delayMs?: number;
};

/**
 * Autoguardado por inactividad. El equipo llena formatos de 40 campos: perder
 * eso por cerrar la pestaña era el reclamo número uno.
 *
 * `saveNow()` fuerza el guardado (Ctrl+S, botón Guardar) y devuelve si hubo
 * cambios pendientes, para que el llamador decida si regenera el PDF.
 */
export function useAutosave<T>({ value, enabled, save, delayMs = 1800 }: Options<T>) {
  const serialized = useMemo(() => JSON.stringify(value ?? null), [value]);
  const baselineRef = useRef<string | null>(null);
  const valueRef = useRef(value);
  const saveRef = useRef(save);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  valueRef.current = value;
  saveRef.current = save;

  const [status, setStatus] = useState<AutosaveStatus>('clean');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');

  /** Toma el valor actual como «ya guardado» (al abrir otro registro). */
  const reset = useCallback((next?: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    baselineRef.current = JSON.stringify((next ?? valueRef.current) ?? null);
    setStatus('clean');
    setError('');
  }, []);

  const flush = useCallback(async () => {
    if (!enabled) return false;
    if (timerRef.current) clearTimeout(timerRef.current);
    const snapshot = JSON.stringify(valueRef.current ?? null);
    if (snapshot === baselineRef.current) return false;
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setStatus('saving');
    try {
      await saveRef.current(valueRef.current);
      baselineRef.current = snapshot;
      setSavedAt(new Date());
      setStatus(JSON.stringify(valueRef.current ?? null) === snapshot ? 'saved' : 'dirty');
      setError('');
      return true;
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      return false;
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (baselineRef.current === null) {
      baselineRef.current = serialized;
      return;
    }
    if (!enabled) return;
    if (serialized === baselineRef.current) {
      setStatus((s) => (s === 'saving' ? s : s === 'error' ? s : 'clean'));
      return;
    }
    setStatus('dirty');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [serialized, enabled, delayMs, flush]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const dirty = status === 'dirty' || status === 'error';

  return { status, savedAt, error, dirty, flush, reset };
}

/** Texto corto para la píldora de estado. */
export function autosaveLabel(status: AutosaveStatus, savedAt: Date | null): string {
  if (status === 'saving') return 'Guardando…';
  if (status === 'error') return 'Error al guardar';
  if (status === 'dirty') return 'Cambios sin guardar';
  if (savedAt) {
    return `Guardado ${savedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return 'Todo guardado';
}
