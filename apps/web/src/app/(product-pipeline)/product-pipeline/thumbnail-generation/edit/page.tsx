'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { thumbnailWorkspaceHref } from '../../_shared/lib/product-pipeline-routes';
import { ThumbnailEditorWorkspace } from './components/ThumbnailEditorWorkspace';

export type { EditorMode, HistoryCandidate } from './lib/edit-page-types';

export default function ThumbnailEditorWorkspacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ThumbnailEditorWorkspaceRoute />
    </Suspense>
  );
}

function ThumbnailEditorWorkspaceRoute() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const modeParam = searchParams.get('mode');
  const forceFullPage = searchParams.get('fullPage') === '1';
  const workspaceHref = forceFullPage
    ? null
    : thumbnailWorkspaceHref({
        sourceCandidateId: searchParams.get('sourceCandidateId'),
        contentWorkspaceId: searchParams.get('contentWorkspaceId'),
        returnTo: searchParams.get('returnTo'),
        generationId: searchParams.get('generationId'),
        imageUrl: searchParams.get('imageUrl'),
        uploadKey: searchParams.get('uploadKey'),
        mode: modeParam === 'creative' ? 'creative' : 'edit',
      });

  useEffect(() => {
    if (workspaceHref) router.replace(workspaceHref);
  }, [router, workspaceHref]);

  if (workspaceHref) return <div className="min-h-screen bg-slate-50" />;

  return <ThumbnailEditorWorkspace />;
}
