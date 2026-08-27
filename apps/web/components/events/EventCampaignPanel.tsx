'use client';

import { FlowSteps } from '@/components/ui/FlowSteps';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { EventDetail } from '@/components/events/event-detail.types';

type CampaignForm = {
  type: string;
  notes: string;
  channels: string;
  budget: string;
  mediaPlan: string;
  creatives: string;
  timeline: string;
};

type EventCampaignPanelProps = {
  event: EventDetail;
  closed: boolean;
  saving: boolean;
  canCampaign: boolean;
  campaignForm: CampaignForm;
  setCampaignForm: (form: CampaignForm) => void;
  onSaveCampaign: () => Promise<void>;
  onToggleCampaignAuth: (authorized: boolean) => Promise<void>;
};

const CAMPAIGN_FLOW = ['Borrador', 'Guardada', 'Autorizada'];

export function EventCampaignPanel({
  event,
  closed,
  saving,
  canCampaign,
  campaignForm,
  setCampaignForm,
  onSaveCampaign,
  onToggleCampaignAuth,
}: EventCampaignPanelProps) {
  const hasSaved = !!event.campaign;
  const flowIndex = event.campaign?.authorized ? 2 : hasSaved ? 1 : 0;

  return (
    <div className="stack">
      <FlowSteps steps={CAMPAIGN_FLOW} activeIndex={flowIndex} />

      {!canCampaign ? (
        <div className="module-banner">
          Solo el equipo de campaña (Melissa / Williams) puede editar y autorizar.
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Campaña publicitaria</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Plan de medios, creativos y presupuesto. Autoriza cuando esté listo para producción.
            </p>
          </div>
          <div className="panel-head-actions">
            {event.campaign?.authorized ? (
              <StatusBadge value="Autorizada" kind="raw" className="ok" />
            ) : (
              <StatusBadge value="Sin autorizar" kind="raw" className="warn" />
            )}
            {canCampaign && !closed ? (
              <>
                <button className="btn btn-sm" type="button" disabled={saving} onClick={onSaveCampaign}>
                  {saving ? 'Guardando…' : 'Guardar campaña'}
                </button>
                {!event.campaign?.authorized ? (
                  <button className="btn ghost btn-sm" type="button" onClick={() => onToggleCampaignAuth(true)}>
                    Autorizar
                  </button>
                ) : (
                  <button className="btn ghost btn-sm" type="button" onClick={() => onToggleCampaignAuth(false)}>
                    Revocar autorización
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
        <div className="panel-body">
          <div className="form panel--narrow">
            <FormGrid>
              <label>
                Tipo de campaña
                <select
                  className="field"
                  disabled={!canCampaign || closed}
                  value={campaignForm.type}
                  onChange={(e) => setCampaignForm({ ...campaignForm, type: e.target.value })}
                >
                  <option value="INTERNAL">Interna (Melissa / Will)</option>
                  <option value="EXTERNAL">Externa</option>
                  <option value="NONE">Sin campaña</option>
                </select>
              </label>
              <label>
                Presupuesto (MXN)
                <input
                  className="field"
                  type="number"
                  disabled={!canCampaign || closed}
                  value={campaignForm.budget}
                  onChange={(e) => setCampaignForm({ ...campaignForm, budget: e.target.value })}
                  placeholder="0"
                />
              </label>
            </FormGrid>
            <label>
              Canales
              <input
                className="field"
                disabled={!canCampaign || closed}
                value={campaignForm.channels}
                onChange={(e) => setCampaignForm({ ...campaignForm, channels: e.target.value })}
                placeholder="Meta, Google, radio, OOH, influencers…"
              />
            </label>
            <label>
              Plan de medios
              <textarea
                className="field"
                rows={3}
                disabled={!canCampaign || closed}
                value={campaignForm.mediaPlan}
                onChange={(e) => setCampaignForm({ ...campaignForm, mediaPlan: e.target.value })}
                placeholder="Fases, piezas, fechas clave…"
              />
            </label>
            <label>
              Creatividades / artes
              <textarea
                className="field"
                rows={2}
                disabled={!canCampaign || closed}
                value={campaignForm.creatives}
                onChange={(e) => setCampaignForm({ ...campaignForm, creatives: e.target.value })}
                placeholder="KV, stories, pendones, pauta…"
              />
            </label>
            <label>
              Timeline
              <input
                className="field"
                disabled={!canCampaign || closed}
                value={campaignForm.timeline}
                onChange={(e) => setCampaignForm({ ...campaignForm, timeline: e.target.value })}
                placeholder="Teaser → preventa → semana del show"
              />
            </label>
            <label>
              Notas internas
              <textarea
                className="field"
                rows={2}
                disabled={!canCampaign || closed}
                value={campaignForm.notes}
                onChange={(e) => setCampaignForm({ ...campaignForm, notes: e.target.value })}
                placeholder="Acuerdos, restricciones, contactos…"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
