'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function ArtsPage() {
  return (
    <ModuleChecklistIndex
      title="Artes / Shows"
      description="Entregables de artes, deadlines y aprobaciones."
      templateKeys={['ARTES_SHOWS']}
      titleMatch={new RegExp('artes|shows', 'i')}
      fields={[
        { id: 'promotores', label: 'Promotores' },
        { id: 'boletera', label: 'Boletera' },
        { id: 'sponsors', label: 'Sponsors' },
      ]}
    />
  );
}
