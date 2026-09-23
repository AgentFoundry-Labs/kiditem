'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import EditorErrorScreen from '../../../_shared/components/detail-editor/EditorErrorScreen';
import EditorLoadingScreen from '../../../_shared/components/detail-editor/EditorLoadingScreen';
import {
  collectedProductDetailHref,
  detailPageEditorHref,
} from '../../../_shared/lib/product-pipeline-routes';
import { useSalesProductWorkspace } from '../../../_shared/hooks/useSalesProductWorkspace';

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

/**
 * 수집상품의 상세페이지 에디터 진입. 판매상품 초안 id 로 열고, 초안의 작업공간이 고른(또는 마지막)
 * 상세페이지를 에디터로 넘긴다. 작업공간이 없으면 만든 상세페이지가 없다는 화면을 보인다.
 */
function CandidateEditorPageContent() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const salesProductId = params.id as string;
  const generationId =
    search.get('generationId') ??
    search.get('boldId') ??
    search.get('kpId') ??
    search.get('agentId');
  const closeHref = collectedProductDetailHref(salesProductId);
  const { workspace, isLoading } = useSalesProductWorkspace(generationId ? null : salesProductId);

  const firstDetailPageId = useMemo(
    () => workspace?.currentDetailPageGenerationId
      ?? workspace?.history.find((item) => item.contentType === 'detail_page')?.id
      ?? null,
    [workspace],
  );

  useEffect(() => {
    const targetGenerationId = generationId ?? firstDetailPageId;
    if (!targetGenerationId) return;
    router.replace(detailPageEditorHref({
      salesProductId,
      generationId: targetGenerationId,
      returnTo: closeHref,
    }));
  }, [closeHref, firstDetailPageId, generationId, router, salesProductId]);

  if (generationId || isLoading || firstDetailPageId) {
    return <EditorLoadingScreen />;
  }

  return (
    <EditorErrorScreen
      error="이 상품에 만든 상세페이지가 아직 없습니다."
      onRetry={() =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.contentWorkspaces.forSalesProduct(salesProductId),
        })
      }
      onClose={() => router.push(closeHref)}
    />
  );
}
