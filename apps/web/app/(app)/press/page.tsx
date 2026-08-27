'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function PressPage() {
  return (
    <ModuleChecklistIndex
      title="Rueda de prensa"
      description="Confirmaciones, venue y logística de RP por evento."
      hint="Confirma venue, hora y ciudad con prensa con al menos una semana de anticipación."
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
