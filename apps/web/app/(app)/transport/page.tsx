'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function TransportPage() {
  return (
    <ModuleChecklistIndex
      title="Transportación"
      description="Vans / proveedor / traslados por evento."
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
