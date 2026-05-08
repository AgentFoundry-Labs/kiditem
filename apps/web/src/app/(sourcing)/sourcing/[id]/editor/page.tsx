'use client';

import { Suspense, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import {
  getTemplate,
  parseDetailPageData,
} from '@kiditem/templates';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { ensureStyledDetailHtml, renderTemplateToHtml } from '../../lib/template-html';
import DetailPageEditor from './components/DetailPageEditor';
import EditorErrorScreen from './components/EditorErrorScreen';
import EditorLoadingScreen from './components/EditorLoadingScreen';
import { useEditorData } from './hooks/useEditorData';
import { API_BASE } from '@/lib/api';
import {
  rowToRendererData,
  useKidsPlayfulGenerationList,
  useKidsPlayfulOne,
  useBoldVerticalGenerationList,
} from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import { buildKidsPlayfulHtml } from '@/app/(media-ai)/generate/lib/build-kids-playful-html';
import {
  adaptBoldVerticalToDetailPageData,
  type BoldVerticalGeneration,
} from '@/app/(media-ai)/generate/lib/bold-vertical-types';
import { useGenerationHistory } from '../hooks/useGenerationHistory';

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-50">
          <Loader2 size={32} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <EditorPageContent />
    </Suspense>
  );
}

function EditorPageContent() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const productId = params.id as string;

  // ?kpId=... / ?boldId=... / ?agentId=... 로 진입 시 해당 이력을 에디터에 load.
  const kpId = search.get('kpId');
  const boldId = search.get('boldId');
  const agentId = search.get('agentId');
  const hasExplicitSource = !!(kpId || boldId || agentId);
  const { data: editorData, isLoading, error: queryError } = useEditorData(productId);
  const { data: kpEntry, isLoading: isKpLoading, error: kpError } = useKidsPlayfulOne(kpId);
  const { data: boldEntry, isLoading: isBoldLoading, error: boldError } = useKidsPlayfulOne(boldId);
  const { data: kpEntries = [], isLoading: isKpListLoading } =
    useKidsPlayfulGenerationList(productId);
  const { data: boldEntries = [], isLoading: isBoldListLoading } =
    useBoldVerticalGenerationList(productId);
  const { data: agentHistory = [], isLoading: isAgentHistoryLoading } =
    useGenerationHistory(productId);

  const previewData = editorData?.previewData ?? null;
  const templateConfig = editorData?.templateConfig ?? null;
  const templateCss = editorData?.templateCss ?? '';

  // 저장본은 직접 이력을 찍고 들어온 경우가 아닐 때만 기본 시작점으로 쓴다.
  const { data: editedHtmlRow, isLoading: isEditedHtmlLoading } = useQuery({
    queryKey: ['edited-html', productId],
    queryFn: () =>
      apiClient.get<{ html: string | null; savedAt: string | null }>(
        `/api/products/${productId}/edited-html`,
      ),
    enabled: !hasExplicitSource,
  });
  const selectedAgentEntry = useMemo(
    () => (agentId ? agentHistory.find((item) => item.id === agentId) ?? null : null),
    [agentId, agentHistory],
  );

  const error = queryError
    ? isApiError(queryError)
      ? queryError.detail
      : '에디터 데이터를 불러올 수 없습니다.'
    : kpError
      ? isApiError(kpError)
        ? kpError.detail
        : 'Trend Vertical 이력을 불러올 수 없습니다.'
      : boldError
        ? isApiError(boldError)
          ? boldError.detail
          : 'KIDITEM DESIGN 이력을 불러올 수 없습니다.'
        : agentId && !isAgentHistoryLoading && !selectedAgentEntry
          ? '선택한 생성 이력을 찾을 수 없습니다.'
          : agentId && selectedAgentEntry && !selectedAgentEntry.detailPageData
            ? '선택한 생성 이력에 상세페이지 데이터가 없습니다.'
    : null;

  const realKpEntries = useMemo(
    () => kpEntries.filter((e) => !e.id.startsWith('optimistic-')),
    [kpEntries],
  );
  const realBoldEntries = useMemo(
    () => boldEntries.filter((e) => !e.id.startsWith('optimistic-')),
    [boldEntries],
  );
  const defaultKpEntry = !hasExplicitSource && !editedHtmlRow?.html
    ? realKpEntries[0] ?? null
    : null;
  const defaultBoldEntry = !hasExplicitSource && !editedHtmlRow?.html && !defaultKpEntry
    ? realBoldEntries[0] ?? null
    : null;
  const activeKpEntry = kpEntry ?? defaultKpEntry;
  const activeBoldEntry = boldEntry ?? defaultBoldEntry;

  // 우선순위: 명시 선택 이력 → 저장된 edits → 최신 생성 이력 → preview default.
  const editorHtml = useMemo(() => {
    if (!hasExplicitSource && editedHtmlRow?.html) {
      return ensureStyledDetailHtml(editedHtmlRow.html, templateCss);
    }
    if (activeKpEntry) {
      return buildKidsPlayfulHtml(rowToRendererData(activeKpEntry));
    }
    if (activeBoldEntry) {
      // KIDITEM generation → BoldVertical 템플릿.
      try {
        const adapted = adaptBoldVerticalToDetailPageData(
          activeBoldEntry.result as unknown as BoldVerticalGeneration,
          activeBoldEntry.imageUrls,
          activeBoldEntry.processedImages,
          API_BASE,
        );
        const data = parseDetailPageData(adapted);
        const config = getTemplate('bold-vertical');
        return renderTemplateToHtml(
          config.component as React.ComponentType<unknown>,
          data,
          config,
          templateCss,
        );
      } catch {
        return '';
      }
    }
    if (agentId) {
      if (!selectedAgentEntry?.detailPageData) return '';
      try {
        const data = parseDetailPageData(selectedAgentEntry.detailPageData);
        const config = getTemplate('bold-vertical');
        return renderTemplateToHtml(
          config.component as React.ComponentType<unknown>,
          data,
          config,
          templateCss,
        );
      } catch {
        return '';
      }
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
    agentId,
    activeKpEntry,
    activeBoldEntry,
    previewData,
    selectedAgentEntry,
    templateConfig,
    templateCss,
    editedHtmlRow?.html,
    hasExplicitSource,
  ]);

  const handleClose = () => router.push(`/sourcing/${productId}`);
  const handleSave = async (html: string) => {
    try {
      await apiClient.post<{ ok: true }>(
        `/api/products/${productId}/edited-html`,
        { html },
      );
      toast.success('상세페이지 저장 완료');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['edited-html', productId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.preview(productId) }),
      ]);
      router.push(`/sourcing/${productId}`);
    } catch (err) {
      const msg = isApiError(err) ? err.detail : '저장 실패';
      toast.error(msg);
    }
  };

  // 상세페이지 생성이 아직 끝나지 않은 (Agent OS async) entry 는 loading 으로
  // 취급한다. useKidsPlayfulOne 이 폴링하므로 status 가 'completed' 또는
  // 'failed' 가 되면 자동으로 다시 렌더링되어 이 가드를 빠져나온다.
  const isKpStillProcessing =
    !!kpEntry &&
    (kpEntry.imageProcessingStatus === 'pending' ||
      kpEntry.imageProcessingStatus === 'processing');
  const isBoldStillProcessing =
    !!boldEntry &&
    (boldEntry.imageProcessingStatus === 'pending' ||
      boldEntry.imageProcessingStatus === 'processing');

  // Trend/KIDITEM 모드는 templateConfig 없어도 동작 가능.
  if (
    isLoading ||
    (!hasExplicitSource && isEditedHtmlLoading) ||
    (!hasExplicitSource && !editedHtmlRow?.html && (isKpListLoading || isBoldListLoading)) ||
    (!!kpId && isKpLoading) ||
    (!!boldId && isBoldLoading) ||
    (!!agentId && isAgentHistoryLoading) ||
    isKpStillProcessing ||
    isBoldStillProcessing
  ) {
    return <EditorLoadingScreen />;
  }

  if (error || (!templateConfig && !kpEntry && !boldEntry && !selectedAgentEntry)) {
    return (
      <EditorErrorScreen
        error={error}
        onRetry={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.preview(productId) })
        }
        onClose={handleClose}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
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
