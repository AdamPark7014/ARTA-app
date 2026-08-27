import { AppShell } from '@/components/app-shell/AppShell';
import { LoadingBlock } from '@/components/ui/LoadingBlock';

export function EventDetailSkeleton() {
  return (
    <AppShell title="Evento">
      <div className="stack page-workspace" aria-busy="true" aria-label="Cargando evento">
        <div className="panel event-hero event-hero--loading">
          <div className="panel-body">
            <div className="skeleton skeleton--label" style={{ width: 140 }} />
            <div className="skeleton skeleton--value" style={{ width: 'min(420px, 70%)', height: 34, marginTop: 12 }} />
            <div className="skeleton skeleton--row" style={{ width: 'min(320px, 55%)', marginTop: 10 }} />
            <div className="skeleton-stack" style={{ marginTop: 18 }}>
              <div className="skeleton skeleton--row" style={{ width: 220, height: 34, borderRadius: 8 }} />
            </div>
          </div>
        </div>
        <div className="event-tabs-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton skeleton--row" style={{ width: 88 + (i % 3) * 24, height: 32 }} />
          ))}
        </div>
        <LoadingBlock rows={6} label="Cargando evento…" />
      </div>
    </AppShell>
  );
}
