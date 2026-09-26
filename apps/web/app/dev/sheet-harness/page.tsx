import { notFound } from 'next/navigation';
import { ClientSheetHarness } from './ClientSheetHarness';

export const dynamic = 'force-dynamic';

type Props = { searchParams?: Record<string, string | string[]> };

export default function SheetHarnessPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === 'production' && !process.env.E2E_PORT) {
    notFound();
  }
  const sp = searchParams || {};
  const name =
    (typeof sp.name === 'string' ? sp.name : Array.isArray(sp.name) ? sp.name[0] : null) ||
    'CORRIDA_BASE.xlsx';
  const variant =
    ((typeof sp.variant === 'string' ? sp.variant : Array.isArray(sp.variant) ? sp.variant[0] : null) as
      | 'default'
      | 'campaign'
      | 'finance') || 'finance';
  const url = `/dev/sheet-files?name=${encodeURIComponent(name)}`;
  return (
    <div className="content">
      <div className="panel">
        <div className="panel-head">
          <h2>SheetEditor — Harness ({name})</h2>
        </div>
        <div className="panel-body">
          <ClientSheetHarness url={url} name={name} variant={variant} />
        </div>
      </div>
    </div>
  );
}

