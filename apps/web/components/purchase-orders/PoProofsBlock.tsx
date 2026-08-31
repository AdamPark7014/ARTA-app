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
  onChange: () => void | Promise<void>;
};

export function PoProofsBlock({
  poId,
  eventId,
  poAmount,
  proofs = [],
  canUpload = true,
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
    <div className="po-proofs stack" style={{ marginTop: '0.75rem' }}>
      <div className="muted kpi-sub" style={{ fontWeight: 600 }}>
        Comprobantes de pago
      </div>
      {proofs.length ? (
        <ul className="po-proofs__list" style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {proofs.map((p) => (
            <li key={p.id}>
              <a href={p.fileUrl} target="_blank" rel="noopener noreferrer">
                {p.label || 'Comprobante'}
              </a>
              {p.amount != null ? (
                <span className="muted kpi-sub"> · ${Number(p.amount).toLocaleString('es-MX')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted kpi-sub" style={{ margin: 0 }}>
          Sin comprobantes adjuntos
        </p>
      )}
      {canUpload ? (
        <div className="row row--tight">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f).catch(console.error);
            }}
          />
          {uploading ? <span className="muted kpi-sub">Subiendo…</span> : null}
        </div>
      ) : null}
      {err ? (
        <p className="muted kpi-sub" style={{ color: 'var(--danger, #c0392b)', margin: 0 }}>
          {err}
        </p>
      ) : null}
    </div>
  );
}
