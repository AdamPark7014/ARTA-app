'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormGrid, PageHeader } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SectionFileCreate } from '@/components/files/SectionFileCreate';
import type { EventFile, Sponsor } from '@/components/events/event-detail.types';
import {
  SPONSOR_CONTRIBUTION_TYPES,
  SPONSOR_STATUSES,
  SPONSOR_STATUS_LABELS,
  SPONSOR_TIERS,
  emptySponsorForm,
  sponsorStatusLabel,
  sponsorStatusTone,
  type SponsorFormState,
} from '@/lib/sponsor-constants';
import {
  buildSponsorConvenioPdfBlob,
  buildSponsorConvenioWorkbook,
  buildSponsorsPortfolioWorkbook,
  sponsorConvenioFileName,
  sponsorConvenioPdfFileName,
  sponsorsPortfolioFileName,
  workbookToXlsxBlob,
  type SponsorConvenioInput,
} from '@/lib/sponsor-convenio-template';
import {
  fileKindLabel,
  fileRoleLabel,
  isSalidaPdf,
} from '@/lib/file-modules';

type EventMeta = {
  id: string;
  name: string;
  artist?: string | null;
  venue?: string | null;
  city?: string | null;
  startsAt?: string | null;
  promoter?: string | null;
};

type EventSponsorsPanelProps = {
  closed: boolean;
  canEdit?: boolean;
  event: EventMeta;
  sponsors: Sponsor[];
  files: EventFile[];
  sponsorForm: SponsorFormState;
  setSponsorForm: (form: SponsorFormState) => void;
  onCreateSponsor: () => Promise<void>;
  onRemoveSponsor: (sponsorId: string) => Promise<void>;
  onUpdateSponsor: (sponsorId: string, patch: Record<string, unknown>) => Promise<void>;
  onUploadFile: (file: File) => Promise<void>;
  onDeleteFile?: (fileId: string) => Promise<void>;
  onOpenFile?: (file: EventFile) => void;
};

function money(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function isoDate(v?: string | Date | null) {
  if (!v) return '';
  const s = typeof v === 'string' ? v : v.toISOString();
  return s.slice(0, 10);
}

function toConvenioSponsor(s: Sponsor | SponsorFormState): SponsorConvenioInput['sponsor'] {
  return {
    name: s.name,
    tier: 'tier' in s ? s.tier : null,
    status: 'status' in s ? s.status : null,
    contactName: 'contactName' in s ? s.contactName : null,
    contactEmail: 'contactEmail' in s ? s.contactEmail : null,
    contactPhone: 'contactPhone' in s ? s.contactPhone : null,
    contact: s.contact,
    contribution: s.contribution,
    amount: s.amount,
    benefits: 'benefits' in s ? s.benefits : null,
    deliverables: 'deliverables' in s ? s.deliverables : null,
    paymentTerms: 'paymentTerms' in s ? s.paymentTerms : null,
    validFrom: 'validFrom' in s ? s.validFrom || null : null,
    validUntil: 'validUntil' in s ? s.validUntil || null : null,
    notes: s.notes,
  };
}

function SponsorFields({
  value,
  onChange,
  compact,
}: {
  value: SponsorFormState;
  onChange: (next: SponsorFormState) => void;
  compact?: boolean;
}) {
  const set = (patch: Partial<SponsorFormState>) => onChange({ ...value, ...patch });
  return (
    <div className={`sponsor-form ${compact ? 'sponsor-form--compact' : ''}`}>
      <section className="sponsor-form__section">
        <h3 className="sponsor-form__title">Marca y nivel</h3>
        <FormGrid>
          <label>
            Marca / empresa
            <input
              className="field"
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Razón social o nombre comercial"
            />
          </label>
          <label>
            Nivel del convenio
            <select
              className="field"
              value={value.tier}
              onChange={(e) => set({ tier: e.target.value })}
            >
              {SPONSOR_TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estatus
            <select
              className="field"
              value={value.status}
              onChange={(e) => set({ status: e.target.value })}
            >
              {SPONSOR_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {SPONSOR_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </label>
        </FormGrid>
      </section>

      <section className="sponsor-form__section">
        <h3 className="sponsor-form__title">Aportación</h3>
        <FormGrid>
          <label>
            Tipo de aportación
            <select
              className="field"
              value={value.contribution}
              onChange={(e) => set({ contribution: e.target.value })}
            >
              {SPONSOR_CONTRIBUTION_TYPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Monto (MXN)
            <input
              className="field"
              type="number"
              min={0}
              value={value.amount}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder="0.00"
            />
          </label>
          <label>
            Condiciones de pago
            <input
              className="field"
              value={value.paymentTerms}
              onChange={(e) => set({ paymentTerms: e.target.value })}
              placeholder="Ej. 50% anticipo, 50% al show"
            />
          </label>
        </FormGrid>
        <FormGrid>
          <label>
            Vigencia desde
            <input
              className="field"
              type="date"
              value={value.validFrom}
              onChange={(e) => set({ validFrom: e.target.value })}
            />
          </label>
          <label>
            Vigencia hasta
            <input
              className="field"
              type="date"
              value={value.validUntil}
              onChange={(e) => set({ validUntil: e.target.value })}
            />
          </label>
        </FormGrid>
      </section>

      <section className="sponsor-form__section">
        <h3 className="sponsor-form__title">Contacto comercial</h3>
        <FormGrid>
          <label>
            Nombre
            <input
              className="field"
              value={value.contactName}
              onChange={(e) => set({ contactName: e.target.value })}
              placeholder="Persona de contacto"
            />
          </label>
          <label>
            Correo
            <input
              className="field"
              type="email"
              value={value.contactEmail}
              onChange={(e) => set({ contactEmail: e.target.value })}
              placeholder="correo@marca.com"
            />
          </label>
          <label>
            Teléfono
            <input
              className="field"
              value={value.contactPhone}
              onChange={(e) => set({ contactPhone: e.target.value })}
              placeholder="10 dígitos"
            />
          </label>
        </FormGrid>
      </section>

      <section className="sponsor-form__section">
        <h3 className="sponsor-form__title">Alcance del convenio</h3>
        <label>
          Beneficios para la marca
          <textarea
            className="field"
            rows={3}
            value={value.benefits}
            onChange={(e) => set({ benefits: e.target.value })}
            placeholder="Una línea por beneficio: logo en pantallas, stand, menciones…"
          />
        </label>
        <label>
          Entregables de Arta / evento
          <textarea
            className="field"
            rows={3}
            value={value.deliverables}
            onChange={(e) => set({ deliverables: e.target.value })}
            placeholder="Una línea por entregable: artes, reporte de alcance, cortesías…"
          />
        </label>
        <label>
          Notas internas
          <input
            className="field"
            value={value.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Seguimiento, exclusividades, pendientes…"
          />
        </label>
      </section>
    </div>
  );
}

export function EventSponsorsPanel({
  closed,
  canEdit = true,
  event,
  sponsors,
  files,
  sponsorForm,
  setSponsorForm,
  onCreateSponsor,
  onRemoveSponsor,
  onUpdateSponsor,
  onUploadFile,
  onDeleteFile,
  onOpenFile,
}: EventSponsorsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SponsorFormState>(emptySponsorForm());
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const list = sponsors || [];
    const total = list.reduce((s, sp) => s + Number(sp.amount || 0), 0);
    const signed = list.filter((sp) => sp.status === 'SIGNED' || sp.status === 'ACTIVE').length;
    const pipeline = list.filter(
      (sp) => sp.status === 'PROPOSED' || sp.status === 'NEGOTIATING',
    ).length;
    return { total, signed, pipeline, count: list.length };
  }, [sponsors]);

  const eventCtx = {
    eventName: event.name,
    artist: event.artist,
    venue: event.venue,
    city: event.city,
    startsAt: event.startsAt,
    promoter: event.promoter,
  };

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(s: Sponsor) {
    setEditingId(s.id);
    setEditDraft({
      name: s.name,
      tier: s.tier || 'Plata',
      status: s.status || 'PROPOSED',
      contactName: s.contactName || '',
      contactEmail: s.contactEmail || '',
      contactPhone: s.contactPhone || '',
      contact: s.contact || '',
      contribution: s.contribution || 'Efectivo',
      amount: s.amount != null ? String(s.amount) : '',
      benefits: s.benefits || '',
      deliverables: s.deliverables || '',
      paymentTerms: s.paymentTerms || '',
      validFrom: isoDate(s.validFrom),
      validUntil: isoDate(s.validUntil),
      notes: s.notes || '',
    });
  }

  async function saveEdit(id: string) {
    await onUpdateSponsor(id, {
      name: editDraft.name,
      tier: editDraft.tier || undefined,
      status: editDraft.status || undefined,
      contactName: editDraft.contactName || undefined,
      contactEmail: editDraft.contactEmail || undefined,
      contactPhone: editDraft.contactPhone || undefined,
      contact: editDraft.contactPhone || editDraft.contactEmail || editDraft.contactName || undefined,
      contribution: editDraft.contribution || undefined,
      amount: editDraft.amount ? Number(editDraft.amount) : undefined,
      benefits: editDraft.benefits || undefined,
      deliverables: editDraft.deliverables || undefined,
      paymentTerms: editDraft.paymentTerms || undefined,
      validFrom: editDraft.validFrom || undefined,
      validUntil: editDraft.validUntil || undefined,
      notes: editDraft.notes || undefined,
    });
    setEditingId(null);
  }

  async function uploadConvenioExcel(s: Sponsor) {
    await withBusy(async () => {
      const wb = buildSponsorConvenioWorkbook({
        ...eventCtx,
        sponsor: toConvenioSponsor(s),
      });
      const blob = workbookToXlsxBlob(wb);
      const file = new File([blob], sponsorConvenioFileName(s.name, event.name), {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await onUploadFile(file);
    });
  }

  async function uploadConvenioPdf(s: Sponsor) {
    await withBusy(async () => {
      const blob = await buildSponsorConvenioPdfBlob({
        ...eventCtx,
        sponsor: toConvenioSponsor(s),
      });
      const file = new File([blob], sponsorConvenioPdfFileName(s.name, event.name), {
        type: 'application/pdf',
      });
      await onUploadFile(file);
    });
  }

  async function createPortfolioSheet() {
    await withBusy(async () => {
      const wb = buildSponsorsPortfolioWorkbook(
        eventCtx,
        (sponsors || []).map((s) => toConvenioSponsor(s)),
      );
      const blob = workbookToXlsxBlob(wb);
      const file = new File([blob], sponsorsPortfolioFileName(event.name), {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await onUploadFile(file);
    });
  }

  return (
    <div className="stack">
      <PageHeader description="Convenios comerciales del show: nivel, aportación, beneficios, entregables y documentos (Excel / PDF) listos para circular o firmar." />

      <div className="grid-cards kpi-grid-dense">
        <div className="kpi">
          <div className="label">Convenios</div>
          <div className="value">{stats.count}</div>
        </div>
        <div className="kpi">
          <div className="label">En pipeline</div>
          <div className="value">{stats.pipeline}</div>
        </div>
        <div className="kpi">
          <div className="label">Firmados / vigentes</div>
          <div className="value">{stats.signed}</div>
        </div>
        <div className="kpi">
          <div className="label">Aportación total</div>
          <div className="value value--money">{money(stats.total)}</div>
        </div>
      </div>

      {!closed && canEdit ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Nuevo convenio de patrocinio</h2>
              <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
                Detalla marca, nivel, montos y alcance. Después puedes generar Excel o PDF del
                convenio.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form sponsor-create-form">
              <SponsorFields value={sponsorForm} onChange={setSponsorForm} />
              <button
                className="btn"
                type="button"
                disabled={!sponsorForm.name.trim() || busy}
                onClick={onCreateSponsor}
              >
                Guardar convenio
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Documentos de convenio · {files.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Genera plantillas o sube el convenio ya firmado. Quedan en esta pestaña y en
              Documentos.
            </p>
          </div>
        </div>
        <div className="panel-body stack">
          {!closed && canEdit ? (
            <SectionFileCreate
              staysIn="Convenios y patrocinios"
              busy={busy}
              compact={files.length > 0}
              actions={[
                {
                  id: 'portfolio',
                  title: 'Excel portafolio',
                  description: 'Todas las marcas del show en una hoja (montos, tiers, contactos).',
                  after: 'Se abre en Documentos / aquí para editar y sacar PDF.',
                  tone: 'excel',
                  emphasis: 'primary',
                  disabled: !sponsors.length,
                  onClick: () => void createPortfolioSheet(),
                },
                {
                  id: 'upload',
                  title: 'Subir convenio firmado',
                  description: 'PDF o Excel que ya tengan con la marca.',
                  after: 'Queda archivado en esta sección del evento.',
                  tone: 'upload',
                  emphasis: 'secondary',
                  accept: '.pdf,.xlsx,.xls,.docx,image/*',
                  onFile: (f) => void withBusy(() => onUploadFile(f)),
                },
              ]}
            />
          ) : null}
          {files.length ? (
            <ul className="sponsor-files">
              {files.map((f) => {
                const role = fileRoleLabel(f.kind, f.fileName);
                const official = isSalidaPdf(f.fileName);
                return (
                  <li key={f.id} className="sponsor-files__item">
                    <div>
                      <strong>{f.fileName}</strong>
                      <div className="row row--tight" style={{ marginTop: 4 }}>
                        <StatusBadge value={fileKindLabel(f.kind, f.fileName)} kind="raw" />
                        {role ? (
                          <StatusBadge
                            value={role}
                            kind="raw"
                            className={official ? 'ok' : undefined}
                          />
                        ) : null}
                      </div>
                    </div>
                    <div className="row row--tight">
                      {onOpenFile ? (
                        <button
                          className="btn ghost btn-sm"
                          type="button"
                          onClick={() => onOpenFile(f)}
                        >
                          Abrir
                        </button>
                      ) : (
                        <a className="btn ghost btn-sm" href={f.url} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      )}
                      {!closed && canEdit && onDeleteFile ? (
                        <button
                          className="btn ghost btn-sm btn-danger"
                          type="button"
                          onClick={() => void onDeleteFile(f.id)}
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted kpi-sub" style={{ margin: 0 }}>
              Aún no hay archivos de convenio. Genera el portafolio o súbelo firmado.
            </p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Convenios · {sponsors?.length || 0}</h2>
        </div>
        <div className="panel-body stack">
          {!sponsors?.length ? (
            <EmptyState
              title="Sin convenios aún"
              description="Registra cada marca con nivel, aportación y alcance. Luego genera Excel o PDF del convenio."
              steps={[
                'Completa el formulario de convenio',
                'Genera Excel / PDF por marca o el portafolio',
                'Sube la versión firmada cuando llegue',
              ]}
            />
          ) : (
            sponsors.map((s) => (
              <article key={s.id} className="sponsor-card">
                {editingId === s.id ? (
                  <div className="form">
                    <SponsorFields value={editDraft} onChange={setEditDraft} compact />
                    <div className="row row--tight">
                      <button className="btn btn-sm" type="button" onClick={() => saveEdit(s.id)}>
                        Guardar cambios
                      </button>
                      <button
                        className="btn ghost btn-sm"
                        type="button"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="sponsor-card__head">
                      <div>
                        <strong>{s.name}</strong>
                        <div className="sponsor-card__meta">
                          <StatusBadge
                            value={sponsorStatusLabel(s.status)}
                            kind="raw"
                            className={sponsorStatusTone(s.status)}
                          />
                          {s.tier ? <StatusBadge value={s.tier} kind="raw" className="ok" /> : null}
                          {s.contribution ? (
                            <StatusBadge value={s.contribution} kind="raw" />
                          ) : null}
                        </div>
                        <div className="sponsor-card__amount">
                          {s.amount != null ? money(Number(s.amount)) : 'Sin monto'}
                        </div>
                        <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
                          {[s.contactName, s.contactEmail, s.contactPhone || s.contact]
                            .filter(Boolean)
                            .join(' · ') || 'Sin contacto'}
                        </p>
                      </div>
                      <div className="panel-head-actions">
                        {!closed && canEdit ? (
                          <>
                            <button
                              className="btn ghost btn-sm"
                              type="button"
                              disabled={busy}
                              onClick={() => void uploadConvenioExcel(s)}
                            >
                              Excel convenio
                            </button>
                            <button
                              className="btn ghost btn-sm"
                              type="button"
                              disabled={busy}
                              onClick={() => void uploadConvenioPdf(s)}
                            >
                              PDF convenio
                            </button>
                            <button
                              className="btn ghost btn-sm"
                              type="button"
                              onClick={() => startEdit(s)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn ghost btn-sm btn-danger"
                              type="button"
                              onClick={() => onRemoveSponsor(s.id)}
                            >
                              Quitar
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {(s.benefits || s.deliverables || s.paymentTerms) && (
                      <div className="sponsor-card__body">
                        {s.benefits ? (
                          <div>
                            <div className="muted kpi-sub">Beneficios</div>
                            <p style={{ margin: '0.15rem 0 0', whiteSpace: 'pre-wrap' }}>
                              {s.benefits}
                            </p>
                          </div>
                        ) : null}
                        {s.deliverables ? (
                          <div>
                            <div className="muted kpi-sub">Entregables</div>
                            <p style={{ margin: '0.15rem 0 0', whiteSpace: 'pre-wrap' }}>
                              {s.deliverables}
                            </p>
                          </div>
                        ) : null}
                        {s.paymentTerms ? (
                          <div>
                            <div className="muted kpi-sub">Pago</div>
                            <p style={{ margin: '0.15rem 0 0' }}>{s.paymentTerms}</p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
