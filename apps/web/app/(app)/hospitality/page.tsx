'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function HospitalityPage() {
  return (
    <ModuleChecklistIndex
      title="Hospitality / Hospedaje"
      description="Hotel, habitaciones y partidos A/B por evento."
      templateKeys={['HOSPEDAJE']}
      titleMatch={new RegExp('hospedaje|hospitality', 'i')}
      fields={[
        { id: 'nombre', label: 'Hotel' },
        { id: 'habitaciones', label: 'Habitaciones' },
        { id: 'contacto', label: 'Contacto' },
      ]}
    />
  );
}
