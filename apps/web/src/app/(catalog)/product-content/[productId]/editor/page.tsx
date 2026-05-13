'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { ensureStyledDetailHtml, renderTemplateToHtml } from '../../lib/template-html';
import {
  rowToRendererData,
  useBoldVerticalGenerationList,
  useKidsPlayfulGenerationList,
  useKidsPlayfulOne,
  type KidsPlayfulGenerationItem,
} from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import { buildKidsPlayfulHtml } from '@/app/(media-ai)/generate/lib/build-kids-playful-html';
import { buildBoldVerticalHtml } from '@/app/(media-ai)/generate/lib/build-bold-vertical-html';
import {
  adaptBoldVerticalToDetailPageData,
  type BoldVerticalGeneration,
} from '@/app/(media-ai)/generate/lib/bold-vertical-types';
import DetailPageEditor from './components/DetailPageEditor';
import EditorErrorScreen from './components/EditorErrorScreen';
import EditorLoadingScreen from './components/EditorLoadingScreen';
import { useEditorData } from './hooks/useEditorData';

export default function ProductContentEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[var(--surface-sunken)]">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      }
    >
      <ProductContentEditorPageContent />
    </Suspense>
  );
}

function ProductContentEditorPageContent() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const productId = params.productId as string;
  const generationId =
    search.get('generationId') ?? search.get('boldId') ?? search.get('kpId');
  const hasExplicitSource = !!generationId;

  useEffect(() => {
    if (!generationId) return;
    router.replace(`/product-content/detail-pages/${encodeURIComponent(generationId)}/editor`);
  }, [generationId, router]);

  const { data: editorData, isLoading, error: queryError } = useEditorData(productId);
  const {
    data: selectedEntry,
    isLoading: isSelectedLoading,
    error: selectedError,
  } = useKidsPlayfulOne(generationId);
  const { data: kpEntries = [], isLoading: isKpListLoading } =
    useKidsPlayfulGenerationList(productId);
  const { data: boldEntries = [], isLoading: isBoldListLoading } =
    useBoldVerticalGenerationList(productId);
  const { data: editedHtmlRow, isLoading: isEditedHtmlLoading } = useQuery({
    queryKey: queryKeys.productContent.editedHtml(productId),
    queryFn: () =>
      apiClient.get<{ html: string | null; savedAt: string | null }>(
        `/api/products/${productId}/edited-html`,
      ),
  });

  const previewData = editorData?.previewData ?? null;
  const templateConfig = editorData?.templateConfig ?? null;
  const templateCss = editorData?.templateCss ?? '';

  const defaultEntry = useMemo(() => {
    if (hasExplicitSource || editedHtmlRow?.html) return null;
    return [...kpEntries, ...boldEntries]
      .filter((entry) => !entry.id.startsWith('optimistic-'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }, [boldEntries, editedHtmlRow?.html, hasExplicitSource, kpEntries]);

  const activeEntry = selectedEntry ?? defaultEntry;
  const activeFailureMessage =
    activeEntry?.imageProcessingStatus === 'failed'
      ? activeEntry.imageProcessingError || '상세페이지 생성에 실패했습니다.'
      : null;
  const error = queryError
    ? isApiError(queryError)
      ? queryError.detail
      : '에디터 데이터를 불러올 수 없습니다.'
    : selectedError
      ? isApiError(selectedError)
        ? selectedError.detail
        : '선택한 생성 이력을 불러올 수 없습니다.'
      : activeFailureMessage;

  const entryReady =
    !!activeEntry &&
    (!activeEntry.imageProcessingStatus ||
      activeEntry.imageProcessingStatus === 'completed');

  const editorHtml = useMemo(() => {
    const savedEditedHtml = editedHtmlRow?.html ?? null;
    const shouldUseSavedHtml = shouldUseSavedEditedHtml({
      editedHtml: savedEditedHtml,
      editedHtmlSavedAt: editedHtmlRow?.savedAt ?? null,
      hasExplicitSource,
      activeEntryCreatedAt: activeEntry?.createdAt ?? null,
    });
    if (shouldUseSavedHtml && savedEditedHtml) {
      return ensureStyledDetailHtml(savedEditedHtml, templateCss);
    }
    if (entryReady && activeEntry) {
      return renderGenerationHtml(activeEntry, templateCss);
    }
    if (previewData && templateConfig) {
      return renderTemplateToHtml(
        templateConfig.component as React.ComponentType<unknown>,
        previewData,
        templateConfig,
        templateCss,
      );
    }
    return '';
  }, [
    activeEntry,
    editedHtmlRow?.html,
    editedHtmlRow?.savedAt,
    entryReady,
    hasExplicitSource,
    previewData,
    templateConfig,
    templateCss,
  ]);

  const handleClose = () => router.push(`/product-content/${productId}`);
  const handleSave = async (html: string) => {
    try {
      await apiClient.post<{ ok: true }>(
        `/api/products/${productId}/edited-html`,
        { html },
      );
      const savedAt = new Date().toISOString();
      queryClient.setQueryData(
        queryKeys.productContent.editedHtml(productId),
        { html, savedAt },
      );
      toast.success('상세페이지 저장 완료');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.productContent.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.productContent.preview(productId) }),
      ]);
      router.replace(`/product-content/${productId}/editor`);
    } catch (err) {
      const msg = isApiError(err) ? err.detail : '저장 실패';
      toast.error(msg);
      throw err;
    }
  };

  const isEntryProcessing =
    !!selectedEntry &&
    (selectedEntry.imageProcessingStatus === 'pending' ||
      selectedEntry.imageProcessingStatus === 'processing');

  if (generationId) {
    return <EditorLoadingScreen />;
  }

  if (
    isLoading ||
    isEditedHtmlLoading ||
    (!hasExplicitSource && !editedHtmlRow?.html && (isKpListLoading || isBoldListLoading)) ||
    (!!generationId && isSelectedLoading) ||
    isEntryProcessing
  ) {
    return <EditorLoadingScreen />;
  }

  if (error || (!templateConfig && !activeEntry)) {
    return (
      <EditorErrorScreen
        error={error}
        onRetry={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.productContent.preview(productId) })
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
              <div className="flex flex-col items-center gap-3 text-[var(--text-tertiary)]">
                <Loader2 size={32} className="animate-spin" />
                <p className="text-sm font-medium">에디터 로딩 중...</p>
              </div>
            </div>
          }
        >
          <DetailPageEditor
            html={editorHtml}
            templateCss={templateCss}
            productName={editorData?.productName ?? ''}
            productId={productId}
            rawImages={editorData?.rawImages ?? []}
            processedImages={editorData?.processedImages ?? []}
            onSave={handleSave}
            onClose={handleClose}
          />
        </Suspense>
      </div>
    </div>
  );
}

function shouldUseSavedEditedHtml(input: {
  editedHtml: string | null;
  editedHtmlSavedAt: string | null;
  hasExplicitSource: boolean;
  activeEntryCreatedAt: string | null;
}): boolean {
  if (!input.editedHtml) return false;
  if (!input.hasExplicitSource) return true;
  if (!input.activeEntryCreatedAt) return true;
  if (!input.editedHtmlSavedAt) return false;

  const savedAt = Date.parse(input.editedHtmlSavedAt);
  const sourceCreatedAt = Date.parse(input.activeEntryCreatedAt);
  if (!Number.isFinite(savedAt) || !Number.isFinite(sourceCreatedAt)) return false;
  return savedAt >= sourceCreatedAt;
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
