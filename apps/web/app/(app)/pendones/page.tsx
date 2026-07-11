'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function PendonesPage() {
  return (
    <ModuleChecklistIndex
      title="Pendones"
      description="Oleadas de vía pública / pendones por evento."
      templateKeys={['PENDONES']}
      titleMatch={new RegExp('pendon', 'i')}
    />
  );
}
