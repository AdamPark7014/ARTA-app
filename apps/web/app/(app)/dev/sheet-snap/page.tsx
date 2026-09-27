/* eslint-disable react/no-danger */
'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExpandBox } from '@/components/ui/ExpandBox';
import { SheetEditor } from '@/components/files/SheetEditor';
import { FileViewer } from '@/components/files/FileViewer';

function Inner() {
  const qp = useSearchParams();
  const title = qp.get('title') || 'Sheet snapshot';
  const fileId = qp.get('fileId') || undefined;
  const fileName = qp.get('fileName') || 'Libro.xlsx';
  const viewer = qp.get('viewer') === '1';
  const canEdit = qp.get('edit') === '1';
  const url = fileId ? `/api/files/${fileId}/inline` : (qp.get('url') || '/api/files/x/inline');
  const variant = (qp.get('variant') as 'default' | 'campaign' | 'finance') || 'default';
  const content = useMemo(() => {
    if (viewer) {
      return <FileViewer url={url} fileName={fileName} kind="excel" fileId={fileId} />;
    }
    return (
      <SheetEditor
        url={url}
        fileName={fileName}
        fileId={fileId}
        canEdit={canEdit}
        onSave={async () => undefined}
        variant={variant}
      />
    );
  }, [viewer, url, fileName, fileId, canEdit, variant]);
  return (
    <div className="sx-stack" style={{ padding: 16 }}>
      <ExpandBox title={title} defaultExpanded>
        {content}
      </ExpandBox>
    </div>
  );
}

export default function SheetSnapPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

