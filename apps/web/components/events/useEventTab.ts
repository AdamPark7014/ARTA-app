'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Tab } from './event-detail.types';

export const TAB_LABELS: Record<Tab, string> = {
  overview: 'Resumen',
  checklists: 'Checklists',
  ocs: 'Órdenes de compra',
  finance: 'Corrida',
  campaign: 'Campaña',
  ticketing: 'Boletera',
  tasks: 'Tareas',
  sponsors: 'Convenios y patrocinios',
  files: 'Excel / PDF',
};

const VALID_TABS = new Set<string>(Object.keys(TAB_LABELS));

export function isValidTab(value: string | null): value is Tab {
  return !!value && VALID_TABS.has(value);
}

export function useEventTab(defaultTab: Tab = 'overview') {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const initial = isValidTab(urlTab) ? urlTab : defaultTab;
  const [tab, setTabState] = useState<Tab>(initial);

  useEffect(() => {
    const next = searchParams.get('tab');
    if (isValidTab(next)) setTabState(next);
    else if (!next) setTabState('overview');
  }, [searchParams]);

  const selectTab = useCallback(
    (next: Tab, opts?: { checklist?: string }) => {
      setTabState(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'overview') params.delete('tab');
      else params.set('tab', next);

      if (opts?.checklist) params.set('checklist', opts.checklist);
      else params.delete('checklist');

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { tab, selectTab };
}
