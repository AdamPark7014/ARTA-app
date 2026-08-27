'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function TransportPage() {
  return (
    <ModuleChecklistIndex
      title="Transportación"
      description="Vans, proveedor y traslados por evento."
      hint="Verifica proveedor, número de vans y contacto antes del día del evento. Los críticos suelen ser shows en ≤ 7 días."
      templateKeys={['TRANSPORTACION']}
      titleMatch={new RegExp('transport', 'i')}
      fields={[
        { id: 'prov', label: 'Proveedor' },
        { id: 'vans', label: 'Vans' },
        { id: 'modelo', label: 'Modelo' },
        { id: 'contacto', label: 'Contacto' },
      ]}
    />
  );
}
