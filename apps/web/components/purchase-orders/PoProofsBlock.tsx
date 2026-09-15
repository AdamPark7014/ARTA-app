'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { mxn } from '@/lib/price-list';

export type PoProof = {
  id: string;
  fileUrl: string;
  label?: string | null;
  amount?: number | string | null;
};

type PoProofsBlockProps = {
  poId: string;
  eventId: string;
  poAmount: number;
  proofs?: PoProof[];
  canUpload?: boolean;
  /** Si true, se marca que falta el archivo para poder marcar pagada. */
  required?: boolean;
  onChange: () => void | Promise<void>;
};

/** Comprobantes de pago de una OC, en una sola línea: archivos y «Subir». */
export function PoProofsBlock({
  poId,
  eventId,
  poAmount,
  proofs = [],
  canUpload = true,
  required = false,
  onChange,
}: PoProofsBlockProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  async function onPick(file: File) {
    setUploading(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', eventId);
      fd.append('kind', 'proof');
      fd.append('module', 'oc');
      const uploaded = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
      await api(`/purchase-orders/${poId}/proofs`, {
        method: 'POST',
        body: JSON.stringify({
          fileUrl: uploaded.url,
          amount: poAmount,
        }),
      });
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo subir el comprobante');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const missing = required && !proofs.length;

  return (
    <div className={`oc-proofs ${missing ? 'is-missing' : ''}`}>
      <span className="oc-proofs__label">Comprobante</span>
      {proofs.map((p, i) => (
        <a
          key={p.id}
          className="oc-chip"
          href={p.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M4 1.5h5l3.5 3.5v9.5H4z M9 1.5V5h3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          {p.label?.trim() || `Archivo ${i + 1}`}
          {p.amount != null && Number(p.amount) > 0 ? (
            <span className="oc-chip__meta">{mxn(Number(p.amount))}</span>
          ) : null}
        </a>
      ))}
      {!proofs.length ? (
        <span className="oc-proofs__empty">{missing ? 'Falta para marcar pagada' : 'Sin archivo'}</span>
      ) : null}
      {canUpload ? (
        <label className={`btn-quiet btn-quiet--accent oc-proofs__upload ${uploading ? 'is-busy' : ''}`}>
          {uploading ? 'Subiendo…' : proofs.length ? '+ Otro' : '+ Subir'}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".pdf,image/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f).catch(console.error);
            }}
          />
        </label>
      ) : null}
      {err ? (
        <span className="oc-proofs__err" role="alert">
          {err}
        </span>
      ) : null}
    </div>
  );
}
