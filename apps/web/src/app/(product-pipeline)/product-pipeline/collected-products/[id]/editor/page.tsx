'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import EditorErrorScreen from '../../../_shared/components/detail-editor/EditorErrorScreen';
import EditorLoadingScreen from '../../../_shared/components/detail-editor/EditorLoadingScreen';
import {
  collectedProductDetailHref,
  detailPageEditorHref,
} from '../../../_shared/lib/product-pipeline-routes';

interface LinkedGeneration {
  id: string;
  contentType: 'detail_page' | 'image' | string;
}

interface LinkedProducedContentResponse {
  items: LinkedGeneration[];
  total: number;
}

export default function CandidateEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-50">
          <Loader2 size={32} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <CandidateEditorPageContent />
    </Suspense>
  );
}

function CandidateEditorPageContent() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const candidateId = params.id as string;
  const generationId =
    search.get('generationId') ??
    search.get('boldId') ??
    search.get('kpId') ??
    search.get('agentId');
  const closeHref = collectedProductDetailHref(candidateId);

  const archiveQuery = useQuery({
    queryKey: queryKeys.productContent.sourcingLinks(candidateId, {
      limit: '1',
      contentType: 'detail_page',
    }),
    queryFn: () =>
      apiClient.get<LinkedProducedContentResponse>(
        `/api/ai/content-archive/sourcing/${encodeURIComponent(candidateId)}?limit=1&contentType=detail_page`,
      ),
    enabled: !generationId,
  });

  const firstDetailPageId = useMemo(
    () => archiveQuery.data?.items.find((item) => item.contentType === 'detail_page')?.id ?? null,
    [archiveQuery.data?.items],
  );

  useEffect(() => {
    const targetGenerationId = generationId ?? firstDetailPageId;
    if (!targetGenerationId) return;
    router.replace(detailPageEditorHref({
      candidateId,
      generationId: targetGenerationId,
      returnTo: closeHref,
    }));
  }, [candidateId, closeHref, firstDetailPageId, generationId, router]);

  if (generationId || archiveQuery.isLoading || firstDetailPageId) {
    return <EditorLoadingScreen />;
  }

  return (
    <EditorErrorScreen
      error={
        archiveQuery.error
          ? '연결된 상세페이지 작업물을 불러올 수 없습니다.'
          : '이 소싱 후보에 연결된 상세페이지 작업물이 없습니다.'
      }
      onRetry={() =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.productContent.sourcingLinks(candidateId, {
            limit: '1',
            contentType: 'detail_page',
          }),
        })
      }
      onClose={() => router.push(closeHref)}
    />
  );
}
