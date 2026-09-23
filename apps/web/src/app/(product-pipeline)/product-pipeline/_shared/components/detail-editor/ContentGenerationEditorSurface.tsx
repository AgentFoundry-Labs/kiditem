'use client';

import { useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import {
  rowToRendererData,
  useKidsPlayfulOne,
  type KidsPlayfulGenerationItem,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import { buildKidsPlayfulHtml } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/build-kids-playful-html';
import { buildBoldVerticalHtml } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/build-bold-vertical-html';
import {
  adaptBoldVerticalToDetailPageData,
  type BoldVerticalGeneration,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/bold-vertical-types';
import { ensureStyledDetailHtml, isRenderableDetailHtml } from '../../lib/template-html';
import EditorErrorScreen from './EditorErrorScreen';
import EditorLoadingScreen from './EditorLoadingScreen';

const DetailPageEditor = dynamic(() => import('./DetailPageEditor'), {
  ssr: false,
  loading: () => <EditorLoadingScreen />,
});

interface EditedHtmlResponse {
  html: string | null;
  savedAt: string | null;
  assetUrlMap?: Record<string, string>;
}

export function ContentGenerationEditorSurface({
  generationId,
  closeHref,
  salesProductId,
}: {
  generationId: string;
  closeHref: string;
  /** 수집상품 화면에서 열었으면 그 판매상품 초안 id — 저장 뒤 그 화면 값을 새로 읽는다. */
  salesProductId?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: entry,
    isLoading: isEntryLoading,
    error: entryError,
  } = useKidsPlayfulOne(generationId);
  const { data: editedHtmlRow, isLoading: isEditedHtmlLoading } = useQuery({
    queryKey: queryKeys.productContent.generationEditedHtml(generationId),
    queryFn: () =>
      apiClient.get<EditedHtmlResponse>(
        `/api/ai/detail-page/${encodeURIComponent(generationId)}/edited-html`,
      ),
  });
  const { data: templateCss = '' } = useQuery({
    queryKey: ['template-styles-css'],
    queryFn: () =>
      fetch('/templates-styles.css')
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => ''),
  });

  const isEntryProcessing =
    !!entry &&
    (entry.imageProcessingStatus === 'pending' ||
      entry.imageProcessingStatus === 'processing');
  const entryReady =
    !!entry &&
    (!entry.imageProcessingStatus || entry.imageProcessingStatus === 'completed');
  const activeFailureMessage =
    entry?.imageProcessingStatus === 'failed'
      ? entry.imageProcessingError || '상세페이지 생성에 실패했습니다.'
      : null;
  const error = entryError
    ? isApiError(entryError)
      ? entryError.detail
      : '선택한 생성 이력을 불러올 수 없습니다.'
    : activeFailureMessage;
  const validEditedHtml = isRenderableDetailHtml(editedHtmlRow?.html)
    ? editedHtmlRow.html
    : null;

  const editorHtml = useMemo(() => {
    if (validEditedHtml) {
      return ensureStyledDetailHtml(validEditedHtml, templateCss);
    }
    if (entryReady && entry) {
      return renderGenerationHtml(entry, templateCss);
    }
    return '';
  }, [entry, entryReady, templateCss, validEditedHtml]);

  const handleClose = () => {
    router.push(closeHref);
  };

  const handleSave = async (html: string) => {
    try {
      const saved = await apiClient.post<EditedHtmlResponse>(
        `/api/ai/detail-page/${encodeURIComponent(generationId)}/edited-html`,
        { html },
      );
      toast.success('상세페이지 저장 완료');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.productContent.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.productContent.generationEditedHtml(generationId),
        }),
        ...(salesProductId
          ? [
              queryClient.invalidateQueries({ queryKey: queryKeys.collectedProducts.workspace(salesProductId) }),
              queryClient.invalidateQueries({ queryKey: queryKeys.contentWorkspaces.forSalesProduct(salesProductId) }),
            ]
          : []),
      ]);
      handleClose();
      return saved;
    } catch (err) {
      const msg = isApiError(err) ? err.detail : '저장 실패';
      toast.error(msg);
      throw err;
    }
  };

  const handleGeneratedVersionReady = useCallback((nextGenerationId: string) => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.productContent.all }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.productContent.detailGenerationsAll('kids-playful'),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.productContent.detailGenerationsAll('bold-vertical'),
      }),
    ]);
    const params = new URLSearchParams();
    if (salesProductId) params.set('salesProductId', salesProductId);
    if (closeHref) params.set('returnTo', closeHref);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    router.replace(`/product-pipeline/detail-pages/${nextGenerationId}/editor${suffix}`);
  }, [closeHref, queryClient, router, salesProductId]);

  if (isEntryLoading || isEditedHtmlLoading || isEntryProcessing) {
    return <EditorLoadingScreen />;
  }

  if (error || !entry || (!validEditedHtml && !entryReady)) {
    return (
      <EditorErrorScreen
        error={error ?? '편집할 상세페이지 작업물을 찾을 수 없습니다.'}
        onRetry={() =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.productContent.detailGeneration(generationId),
          })
        }
        onClose={handleClose}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="min-h-0 flex-1">
        <DetailPageEditor
          html={editorHtml}
          templateCss={templateCss}
          productName={entry.productName ?? ''}
          productId={entry.productId ?? undefined}
          salesProductId={salesProductId}
          contentGenerationId={generationId}
          contentWorkspaceId={entry.contentWorkspaceId ?? null}
          generationRawInput={entry.rawInput}
          generationTemplateId={entry.templateId}
          rawImages={entry.imageUrls}
          processedImages={Object.values(entry.processedImages)}
          onGeneratedVersionReady={handleGeneratedVersionReady}
          onSave={handleSave}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}

function renderGenerationHtml(entry: KidsPlayfulGenerationItem, templateCss: string): string {
  if (entry.templateId === 'bold-vertical') {
    const adapted = adaptBoldVerticalToDetailPageData(
      entry.result as unknown as BoldVerticalGeneration,
      entry.imageUrls,
      entry.processedImages,
      API_BASE,
    );
    return buildBoldVerticalHtml(adapted, templateCss);
  }
  return buildKidsPlayfulHtml(rowToRendererData(entry), templateCss);
}
