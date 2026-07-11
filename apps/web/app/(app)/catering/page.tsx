'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function CateringPage() {
  return (
    <ModuleChecklistIndex
      title="Catering"
      description="Menús, proveedores y confirmaciones de catering por evento."
      templateKeys={['CATERING']}
      titleMatch={new RegExp('catering', 'i')}
      fields={[]}
    />
  );
}
