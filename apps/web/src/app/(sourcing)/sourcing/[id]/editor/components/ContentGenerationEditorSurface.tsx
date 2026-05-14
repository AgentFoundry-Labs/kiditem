'use client';

import { Suspense, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
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
} from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import { buildKidsPlayfulHtml } from '@/app/(media-ai)/generate/lib/build-kids-playful-html';
import { buildBoldVerticalHtml } from '@/app/(media-ai)/generate/lib/build-bold-vertical-html';
import {
  adaptBoldVerticalToDetailPageData,
  type BoldVerticalGeneration,
} from '@/app/(media-ai)/generate/lib/bold-vertical-types';
import { ensureStyledDetailHtml } from '../../../lib/template-html';
import DetailPageEditor from './DetailPageEditor';
import EditorErrorScreen from './EditorErrorScreen';
import EditorLoadingScreen from './EditorLoadingScreen';

export function ContentGenerationEditorSurface({
  generationId,
  closeHref,
  candidateId,
}: {
  generationId: string;
  closeHref: string;
  candidateId?: string | null;
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
      apiClient.get<{ html: string | null; savedAt: string | null }>(
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

  const editorHtml = useMemo(() => {
    if (editedHtmlRow?.html) {
      return ensureStyledDetailHtml(editedHtmlRow.html, templateCss);
    }
    if (entryReady && entry) {
      return renderGenerationHtml(entry, templateCss);
    }
    return '';
  }, [editedHtmlRow?.html, entry, entryReady, templateCss]);

  const handleClose = () => {
    router.push(closeHref);
  };

  const handleSave = async (html: string) => {
    try {
      await apiClient.post<{ html: string; savedAt: string; assetUrlMap?: Record<string, string> }>(
        `/api/ai/detail-page/${encodeURIComponent(generationId)}/edited-html`,
        { html },
      );
      toast.success('상세페이지 저장 완료');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.productContent.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.productContent.generationEditedHtml(generationId),
        }),
      ]);
      handleClose();
    } catch (err) {
      const msg = isApiError(err) ? err.detail : '저장 실패';
      toast.error(msg);
      throw err;
    }
  };

  if (isEntryLoading || isEditedHtmlLoading || isEntryProcessing) {
    return <EditorLoadingScreen />;
  }

  if (error || !entry || (!editedHtmlRow?.html && !entryReady)) {
    return (
      <EditorErrorScreen
        error={error ?? '편집할 상세페이지 작업물을 찾을 수 없습니다.'}
        onRetry={() =>
          queryClient.invalidateQueries({ queryKey: ['kp-generations', 'one', generationId] })
        }
        onClose={handleClose}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 size={32} className="animate-spin" />
                <p className="text-sm font-medium">에디터 로딩 중...</p>
              </div>
            </div>
          }
        >
          <DetailPageEditor
            html={editorHtml}
            templateCss={templateCss}
            productName={entry.productName ?? ''}
            productId={entry.productId ?? candidateId ?? undefined}
            rawImages={entry.imageUrls}
            processedImages={Object.values(entry.processedImages)}
            onSave={handleSave}
            onClose={handleClose}
          />
        </Suspense>
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
