'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';

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
  /** Si true, se enfatiza que falta el archivo para poder marcar pagado. */
  required?: boolean;
  onChange: () => void | Promise<void>;
};

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
      setErr(e instanceof Error ? e.message : 'Error al subir comprobante');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="po-proofs">
      <div className="po-proofs__head">
        <strong>Comprobantes de pago</strong>
        {required && !proofs.length ? (
          <span className="muted kpi-sub">Obligatorio antes de marcar pagado</span>
        ) : null}
      </div>
      {proofs.length ? (
        <ul className="po-proofs__list">
          {proofs.map((p) => (
            <li key={p.id}>
              <a href={p.fileUrl} target="_blank" rel="noopener noreferrer">
                {p.label || 'Comprobante'}
              </a>
              {p.amount != null ? (
                <span className="muted kpi-sub">
                  {' '}
                  · ${Number(p.amount).toLocaleString('es-MX')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted kpi-sub" style={{ margin: 0 }}>
          {required
            ? 'Aún no hay comprobante. Súbelo para poder marcar la OC como pagada.'
            : 'Sin comprobantes adjuntos'}
        </p>
      )}
      {canUpload ? (
        <label className="btn ghost btn-sm module-upload po-proofs__upload">
          {uploading ? 'Subiendo…' : 'Subir comprobante (PDF o imagen)'}
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
      {err ? <p className="form-error">{err}</p> : null}
    </div>
  );
}
