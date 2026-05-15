'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { ContentGenerationEditorSurface } from '../../../_shared/components/detail-editor/ContentGenerationEditorSurface';
import {
  REGISTERED_PRODUCTS_ROOT,
  normalizeProductPipelineReturnTo,
} from '../../../_shared/lib/product-pipeline-routes';

export default function DetailPageGenerationEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-50">
          <Loader2 size={32} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <DetailPageGenerationEditorPageContent />
    </Suspense>
  );
}

function DetailPageGenerationEditorPageContent() {
  const params = useParams();
  const search = useSearchParams();
  const generationId = params.generationId as string;
  const closeHref = normalizeProductPipelineReturnTo(search.get('returnTo')) ?? REGISTERED_PRODUCTS_ROOT;
  const candidateId = search.get('sourceCandidateId');

  return (
    <ContentGenerationEditorSurface
      generationId={generationId}
      closeHref={closeHref}
      candidateId={candidateId}
    />
  );
}
