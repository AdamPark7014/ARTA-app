import type { ReactNode } from 'react';
import { StatusBadge } from './StatusBadge';

type Props = {
  entity: string;
  status: string;
  name: string;
  meta?: string;
  campaignType?: string;
  campaignAuthorized?: boolean;
  closed?: boolean;
  actions?: ReactNode;
  dangerActions?: ReactNode;
  stats?: {
    avgProgress?: number;
    showLabel?: string;
    daysLabel?: string;
  };
};

/** Cabecera del detalle de evento. */
export function EventHero({
  entity,
  status,
  name,
  meta,
  campaignType,
  campaignAuthorized,
  closed,
  actions,
  dangerActions,
  stats,
}: Props) {
  return (
    <div className="panel event-hero">
      <div className="panel-body">
        <div className="event-hero__main">
          <div className="event-hero__copy">
            <p className="event-hero__eyebrow">
              {entity} · <StatusBadge value={status} kind="event" />
            </p>
            <h2 className="event-hero__title">{name}</h2>
            {meta ? <p className="muted event-hero__meta">{meta}</p> : null}
          </div>
          <div className="event-hero__badges row">
            {stats?.showLabel ? <span className="badge">{stats.showLabel}</span> : null}
            {stats?.daysLabel ? (
              <span className={`badge ${stats.daysLabel.includes('hoy') ? 'arta' : ''}`}>
                {stats.daysLabel}
              </span>
            ) : null}
            {typeof stats?.avgProgress === 'number' ? (
              <span className="badge ok">{stats.avgProgress}% ops</span>
            ) : null}
            {campaignType && campaignType !== 'NONE' ? (
              <span className="badge arta">{campaignType}</span>
            ) : null}
            {campaignAuthorized ? <span className="badge ok">Campaña autorizada</span> : null}
            {closed ? <span className="badge warn">Solo lectura</span> : null}
          </div>
        </div>
        {actions ? <div className="event-hero__actions row">{actions}</div> : null}
        {dangerActions ? (
          <div className="event-hero__danger row">{dangerActions}</div>
        ) : null}
      </div>
    </div>
  );
}
