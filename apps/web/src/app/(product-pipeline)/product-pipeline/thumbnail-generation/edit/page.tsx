'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { productBoundThumbnailWorkspaceHref } from '../../_shared/lib/product-pipeline-routes';
import { ThumbnailEditorWorkspace } from './components/ThumbnailEditorWorkspace';

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
  const workspaceHref = productBoundThumbnailWorkspaceHref({
    productId: searchParams.get('productId'),
    sourceCandidateId: searchParams.get('sourceCandidateId'),
    registrationWorkspaceId: searchParams.get('registrationWorkspaceId'),
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
