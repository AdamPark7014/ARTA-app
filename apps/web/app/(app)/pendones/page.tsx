'use client';

import { ModuleChecklistIndex } from '@/components/ops/ModuleChecklistIndex';

export default function PendonesPage() {
  return (
    <ModuleChecklistIndex
      title="Pendones"
      description="Oleadas de vía pública y pendones por evento."
      hint="Las oleadas requieren permisos de vía pública — revisa fechas de instalación y retiro con tiempo."
      templateKeys={['PENDONES']}
      titleMatch={new RegExp('pendon', 'i')}
    />
  );
}
