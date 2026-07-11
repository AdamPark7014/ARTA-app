'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function PressPage() {
  return (
    <ModuleChecklistIndex
      title="Rueda de prensa"
      description="Confirmaciones, venue y logística de RP por evento."
      templateKeys={['RUEDA_PRENSA']}
      titleMatch={new RegExp('rueda|prensa|rp', 'i')}
      fields={[
        { id: 'venue', label: 'Venue' },
        { id: 'hora', label: 'Hora' },
        { id: 'ciudad', label: 'Ciudad' },
      ]}
    />
  );
}
