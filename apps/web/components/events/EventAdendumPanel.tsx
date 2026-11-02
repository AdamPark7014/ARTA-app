'use client';

import { useMemo } from 'react';
import { EmptyLite, Pill, SectionHead, Tile } from '@/components/ui/Lite';
import { writeDraft, poHandoffKey } from '@/lib/draft-store';
import { moneyKpi } from '@/lib/format';
import { mxn } from '@/lib/price-list';
import { poDateShort, poStatePill, poStateView } from '@/lib/po-payment';
import type { EventPanelProps } from './event-detail.types';

/**
 * Los adendums del evento en un solo lugar: a quién, a qué cuenta, cuánto y su archivo. Un adendum es
 * una orden de compra con esa forma de pago, así que se crea y se autoriza como cualquier OC.
 */
export function EventAdendumPanel({
  event,
  closed,
  canCreate,
  onCreate,
}: EventPanelProps & { canCreate: boolean; onCreate: () => void }) {
  const rows = useMemo(
    () =>
      (event.purchaseOrders ?? [])
        .filter((p) => p.paymentMethod === 'ADENDUM')
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [event.purchaseOrders],
  );
  const total = rows.reduce((s, p) => s + Number(p.amount || 0), 0);
  const pending = rows.filter((p) => p.status !== 'PAID' && p.status !== 'REJECTED' && p.status !== 'CANCELLED');
  const canAdd = canCreate && !closed;

  function start() {
    writeDraft(poHandoffKey(event.id), { paymentMethod: 'ADENDUM' });
    onCreate();
  }

  return (
    <div className="sx-stack">
      <SectionHead title="Adendum" sub="Pagos por adendum de este evento. Se crean y autorizan como orden de compra.">
        {canAdd ? (
          <button className="btn btn-sm" type="button" onClick={start}>
            Nuevo adendum
          </button>
        ) : null}
      </SectionHead>

      {!rows.length ? (
        <div className="surface">
          <EmptyLite
            icon="$"
            title="Sin adendums"
            text={canAdd ? 'Crea uno: lleva persona, cuenta, monto y su imagen o PDF.' : 'Cuando se haga uno, aparecerá aquí.'}
          />
        </div>
      ) : (
        <>
          <div className="tiles">
            <Tile label="Adendums" value={rows.length} sub={`${pending.length} sin liquidar`} />
            <Tile label="Monto total" value={moneyKpi(total)} />
          </div>
          <div className="surface">
            <div className="dtable-wrap">
              <table className="dtable dtable--cards">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Cuenta</th>
                    <th className="num">Monto</th>
                    <th>Estado</th>
                    <th>Archivo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((po) => {
                    const pill = poStatePill(poStateView(po));
                    return (
                      <tr key={po.id}>
                        <td className="card-full">
                          <strong>{po.adendumPerson || po.vendorName || '—'}</strong>
                          {po.createdAt ? <span className="t-small muted"> · {poDateShort(po.createdAt)}</span> : null}
                        </td>
                        <td data-label="Cuenta">{po.adendumAccount || '—'}</td>
                        <td data-label="Monto" className="num">
                          {mxn(Number(po.amount || 0))}
                        </td>
                        <td data-label="Estado">
                          <Pill tone={pill.tone}>{pill.label}</Pill>
                        </td>
                        <td data-label="Archivo">
                          {po.adendumFileUrl ? (
                            <a className="btn-quiet" href={po.adendumFileUrl} target="_blank" rel="noreferrer">
                              {po.adendumFileName || 'Ver archivo'}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
