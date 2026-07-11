'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  label: string;
  signerName: string;
  onSign: (payload: { imageDataUrl: string; signerName: string }) => Promise<void> | void;
  disabled?: boolean;
  existing?: { signerName?: string; imageDataUrl?: string; signedAt?: string } | null;
};

export function SignaturePad({ label, signerName, onSign, disabled, existing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [name, setName] = useState(signerName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(signerName);
  }, [signerName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  }, [existing?.imageDataUrl]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  async function submit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setError('');
    try {
      const imageDataUrl = canvas.toDataURL('image/png');
      await onSign({ imageDataUrl, signerName: name.trim() || signerName });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo firmar');
    } finally {
      setBusy(false);
    }
  }

  if (existing?.imageDataUrl) {
    return (
      <div className="sig-card">
        <div className="sig-label">{label} · firmado</div>
        <img src={existing.imageDataUrl} alt={`Firma ${label}`} className="sig-preview" />
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {existing.signerName}
          {existing.signedAt ? ` · ${new Date(existing.signedAt).toLocaleString('es-MX')}` : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="sig-card">
      <div className="sig-label">{label}</div>
      <label className="muted" style={{ fontSize: 12, display: 'grid', gap: 4, marginBottom: 8 }}>
        Nombre del firmante
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={disabled || busy} />
      </label>
      <canvas
        ref={canvasRef}
        className="sig-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn ghost" onClick={clear} disabled={disabled || busy}>
          Limpiar
        </button>
        <button type="button" className="btn" onClick={submit} disabled={disabled || busy}>
          {busy ? 'Guardando…' : `Firmar ${label.toLowerCase()}`}
        </button>
      </div>
      {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}
