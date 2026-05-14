'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { ContentGenerationEditorSurface } from '../../../[id]/editor/components/ContentGenerationEditorSurface';

export default function SourcingContentGenerationEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-50">
          <Loader2 size={32} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <SourcingContentGenerationEditorPageContent />
    </Suspense>
  );
}

function SourcingContentGenerationEditorPageContent() {
  const params = useParams();
  const generationId = params.generationId as string;

  return (
    <ContentGenerationEditorSurface
      generationId={generationId}
      closeHref="/sourcing"
    />
  );
}
