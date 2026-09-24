'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function CateringPage() {
  return (
    <ModuleChecklistIndex
      title="Catering"
      description="Menús, proveedores y confirmaciones de catering por evento."
      hint="Confirma menús y proveedores al menos 72 h antes del show. Revisa firmas de entrega y autorización."
      templateKeys={['CATERING']}
      titleMatch={new RegExp('catering', 'i')}
      fields={[
        { id: 'proveedor', label: 'Proveedor' },
        { id: 'contacto', label: 'Contacto' },
        { id: 'personas', label: 'Personas' },
      ]}
    />
  );
}
