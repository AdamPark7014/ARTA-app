'use client';

import { SheetEditor } from '@/components/files/SheetEditor';

export function ClientSheetHarness(props: { url: string; name: string; variant: 'default' | 'campaign' | 'finance' }) {
  const { url, name, variant } = props;
  return (
    <SheetEditor url={url} fileName={name} canEdit onSave={async () => {}} panelEditable variant={variant} />
  );
}

