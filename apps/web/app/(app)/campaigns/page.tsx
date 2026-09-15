'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, ReviewPill, SectionHead, Seg, Tile } from '@/components/ui/Lite';
import { MonthCalendar, type CalendarItem } from '@/components/ui/MonthCalendar';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldSearch, FlashMessage } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { campaignRowsFrom, campaignTotals } from '@/lib/campaign-concepts';
import { mxn } from '@/lib/price-list';
import { REVIEW_APPROVER_ROLES, REVIEW_LABELS, reviewStep, type ReviewStep } from '@/lib/review-flow';
import { useUser } from '@/lib/user-context';
import type { CampaignData } from '@/components/events/event-detail.types';

type CampaignRow = {
  id: string;
  eventId: string;
  status?: string;
  authorized: boolean;
  dataJson?: CampaignData | null;
  event: {
    id: string;
    name: string;
    entity: string;
    status: string;
    startsAt?: string | null;
    endsAt?: string | null;
    venue?: string | null;
  };
};

type Section = 'all' | ReviewStep;

function shortDate(iso?: string | null) {
  if (!iso) return 'Sin fecha';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Campañas del portafolio (junta 11-09-2026): estado de cada una, totales
 * interno/externo y un calendario con lo que corre cada día.
 */
export default function CampaignsPage() {
  const { user, entity } = useUser();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('all');
  const [view, setView] = useState<'lista' | 'calendario'>('lista');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ text: string; variant: 'success' | 'error' } | null>(null);
  const canApprove = REVIEW_APPROVER_ROLES.has(user?.roleKey || '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<CampaignRow[]>('/campaigns');
      setRows(data.filter((r) => r.event.entity === entity));
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudieron cargar las campañas', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const concepts = campaignRowsFrom(r.dataJson?.concepts);
        return { ...r, step: reviewStep(r.status, r.authorized), concepts, totals: campaignTotals(concepts) };
      }),
    [rows],
  );

  const counts = useMemo(() => {
    const c: Record<Section, number> = { all: enriched.length, DRAFT: 0, REVIEW: 0, AUTHORIZED: 0, PAID: 0 };
    for (const r of enriched) c[r.step] += 1;
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return enriched
      .filter((r) => section === 'all' || r.step === section)
      .filter((r) => !n || r.event.name.toLowerCase().includes(n) || r.concepts.some((c) => c.concept.toLowerCase().includes(n)))
      .sort((a, b) => new Date(a.event.startsAt || 0).getTime() - new Date(b.event.startsAt || 0).getTime());
  }, [enriched, section, q]);

  const calendarItems = useMemo<CalendarItem[]>(() => {
    const items: CalendarItem[] = [];
    for (const r of filtered) {
      const href = `/events/${r.event.id}?tab=campaign`;
      if (r.event.startsAt) {
        items.push({ key: `show-${r.id}`, label: r.event.name, from: r.event.startsAt, tone: 'show', href });
      }
      r.concepts.forEach((c, i) => {
        if (c.from || c.to) {
          items.push({
            key: `${r.id}-${i}`,
            label: `${c.concept} · ${r.event.name}`,
            from: (c.from || c.to)!,
            to: c.to || c.from,
            tone: 'run',
            href,
          });
        }
      });
    }
    return items;
  }, [filtered]);

  const inReview = enriched.filter((r) => r.step === 'REVIEW');
  const authorizedTotal = enriched
    .filter((r) => r.step === 'AUTHORIZED')
    .reduce((s, r) => s + r.totals.interno, 0);
  const paidTotal = enriched.filter((r) => r.step === 'PAID').reduce((s, r) => s + r.totals.interno, 0);

  async function authorize(r: CampaignRow) {
    try {
      await api(`/campaigns/event/${r.event.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'AUTHORIZED', scope: 'campaign' }),
      });
      setMsg({ text: `${r.event.name}: campaña autorizada`, variant: 'success' });
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo autorizar', variant: 'error' });
    }
  }

  return (
    <AppShell title="Campañas">
      <div className="sx-stack page-workspace">
        <SectionHead
          title="Campañas"
          sub={`${entity === 'ARTA' ? 'Arta' : 'Auditorio'} · ${enriched.length} campaña${enriched.length === 1 ? '' : 's'}`}
        >
          <FieldSearch value={q} onChange={setQ} placeholder="Buscar evento o concepto…" label="Buscar campaña" maxWidth={260} />
        </SectionHead>

        {msg ? (
          <FlashMessage variant={msg.variant} onDismiss={() => setMsg(null)}>
            {msg.text}
          </FlashMessage>
        ) : null}

        {loading ? (
          <LoadingBlock rows={4} label="Cargando campañas…" />
        ) : (
          <>
            <div className="tiles">
              <Tile
                label="En revisión"
                value={inReview.length}
                tone={inReview.length ? 'warn' : undefined}
                sub={inReview.length ? 'esperan autorización' : 'nada pendiente'}
                onClick={() => setSection('REVIEW')}
              />
              <Tile label="Autorizadas" value={mxn(authorizedTotal)} sub={`${counts.AUTHORIZED} por pagar · interno`} onClick={() => setSection('AUTHORIZED')} />
              <Tile label="Pagadas" value={mxn(paidTotal)} tone="accent" sub={`${counts.PAID} campañas · interno`} onClick={() => setSection('PAID')} />
            </div>

            <div className="toolbar-row">
              <Seg
                label="Estado"
                value={section}
                onChange={setSection}
                options={[
                  { key: 'all', label: 'Todas', count: counts.all },
                  { key: 'DRAFT', label: REVIEW_LABELS.DRAFT, count: counts.DRAFT },
                  { key: 'REVIEW', label: REVIEW_LABELS.REVIEW, count: counts.REVIEW },
                  { key: 'AUTHORIZED', label: 'Autorizadas', count: counts.AUTHORIZED },
                  { key: 'PAID', label: 'Pagadas', count: counts.PAID },
                ]}
              />
              <Seg
                label="Vista"
                value={view}
                onChange={setView}
                options={[
                  { key: 'lista', label: 'Lista' },
                  { key: 'calendario', label: 'Calendario' },
                ]}
              />
            </div>

            {view === 'calendario' ? (
              <MonthCalendar items={calendarItems} />
            ) : !filtered.length ? (
              <div className="surface">
                <EmptyLite
                  icon="✦"
                  title={enriched.length ? 'Nada en esta sección' : 'Sin campañas'}
                  text={enriched.length ? undefined : 'Las campañas se arman dentro de cada evento, en la pestaña Campaña.'}
                >
                  {!enriched.length ? (
                    <Link className="btn btn-sm" href="/events">
                      Ir a eventos
                    </Link>
                  ) : null}
                </EmptyLite>
              </div>
            ) : (
              <div className="dtable-wrap">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Evento</th>
                      <th className="num">Conceptos</th>
                      <th className="num">Interna</th>
                      <th className="num">Externa</th>
                      <th>Estado</th>
                      <th className="col-act" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/events/${r.event.id}?tab=campaign`}>
                            <strong>{r.event.name}</strong>
                          </Link>
                          <div className="is-muted t-small">{shortDate(r.event.startsAt)}</div>
                        </td>
                        <td className="num">{r.concepts.length}</td>
                        <td className="num">{mxn(r.totals.interno)}</td>
                        <td className="num">{mxn(r.totals.externo)}</td>
                        <td>
                          <ReviewPill step={r.step} />
                        </td>
                        <td className="col-act">
                          {canApprove && r.step === 'REVIEW' ? (
                            <button className="btn btn-sm" type="button" onClick={() => authorize(r)}>
                              Autorizar
                            </button>
                          ) : null}
                          <Link className="btn-quiet" href={`/events/${r.event.id}?tab=campaign`}>
                            Ver / Editar
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
