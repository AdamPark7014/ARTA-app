'use client';

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
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Campaña publicitaria</h2>
        <div className="row">
          {event.campaign?.authorized ? (
            <StatusBadge value="Autorizada" kind="raw" className="ok" />
          ) : (
            <StatusBadge value="Sin autorizar" kind="raw" className="warn" />
          )}
          {canCampaign && !closed ? (
            <>
              <button className="btn" type="button" disabled={saving} onClick={onSaveCampaign}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              {!event.campaign?.authorized ? (
                <button className="btn ghost" type="button" onClick={() => onToggleCampaignAuth(true)}>
                  Autorizar
                </button>
              ) : (
                <button className="btn ghost" type="button" onClick={() => onToggleCampaignAuth(false)}>
                  Quitar auth
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
              Tipo
              <select
                disabled={!canCampaign || closed}
                value={campaignForm.type}
                onChange={(e) => setCampaignForm({ ...campaignForm, type: e.target.value })}
              >
                <option value="INTERNAL">Interna</option>
                <option value="EXTERNAL">Externa</option>
                <option value="NONE">Ninguna</option>
              </select>
            </label>
            <label>
              Presupuesto
              <input
                type="number"
                disabled={!canCampaign || closed}
                value={campaignForm.budget}
                onChange={(e) => setCampaignForm({ ...campaignForm, budget: e.target.value })}
              />
            </label>
          </FormGrid>
          <label>
            Canales
            <input
              disabled={!canCampaign || closed}
              value={campaignForm.channels}
              onChange={(e) => setCampaignForm({ ...campaignForm, channels: e.target.value })}
              placeholder="Meta, Google, radio, OOH…"
            />
          </label>
          <label>
            Plan de medios
            <textarea
              rows={3}
              disabled={!canCampaign || closed}
              value={campaignForm.mediaPlan}
              onChange={(e) => setCampaignForm({ ...campaignForm, mediaPlan: e.target.value })}
            />
          </label>
          <label>
            Creatividades / artes
            <textarea
              rows={2}
              disabled={!canCampaign || closed}
              value={campaignForm.creatives}
              onChange={(e) => setCampaignForm({ ...campaignForm, creatives: e.target.value })}
            />
          </label>
          <label>
            Timeline
            <input
              disabled={!canCampaign || closed}
              value={campaignForm.timeline}
              onChange={(e) => setCampaignForm({ ...campaignForm, timeline: e.target.value })}
              placeholder="Teaser → on sale → show week"
            />
          </label>
          <label>
            Notas
            <textarea
              rows={2}
              disabled={!canCampaign || closed}
              value={campaignForm.notes}
              onChange={(e) => setCampaignForm({ ...campaignForm, notes: e.target.value })}
            />
          </label>
          {!canCampaign ? <p className="muted">Solo Melissa y Williams editan campaña.</p> : null}
        </div>
      </div>
    </div>
  );
}
