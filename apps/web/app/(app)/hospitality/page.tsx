'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function HospitalityPage() {
  return (
    <ModuleChecklistIndex
      title="Hospedaje"
      description="Hotel, habitaciones y partidas A/B por evento."
      hint="Hotel y habitaciones deben quedar confirmados antes del rider. Prioriza eventos con hospitality incompleto y show cercano."
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
