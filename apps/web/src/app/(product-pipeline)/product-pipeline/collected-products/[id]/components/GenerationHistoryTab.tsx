'use client';

// 생성 이력 탭 — content_generations 테이블 row 시간순 + 클릭 시 그 시점 미리보기.
//
// 사용자가 같은 상품을 여러 번 생성하면 master_products.draft_content / processed_data 는
// 매번 덮어쓰이지만, content_generations 는 INSERT-only 라 모든 버전 보존.
// 이 탭에서 옛날 버전 비교 + 다시 적용 가능.

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Eye,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { cn, formatDateTime } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import {
  getTemplate,
  parseDetailPageData,
} from '@kiditem/templates';
import { ensureStyledDetailHtml, renderTemplateToHtml } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/template-html';
import {
  buildGenerationHistoryHtml,
  generatedDetailTemplateLabel,
} from '../lib/generated-detail-html';
import {
  useGenerationHistory,
  useGenerationHistoryDelete,
  type GenerationHistoryItem,
} from '../hooks/useGenerationHistory';
import { API_BASE } from '@/lib/api';
import { registrationWorkspacesApi } from '../../../_shared/lib/registration-workspaces-api';
import {
  rowToRendererData,
  useKidsPlayfulOne,
  useKidsPlayfulGenerationDelete,
  useKidsPlayfulGenerationList,
  useBoldVerticalGenerationList,
  type KidsPlayfulGenerationItem,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import { buildKidsPlayfulHtml } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/build-kids-playful-html';
import {
  adaptBoldVerticalToDetailPageData,
  type BoldVerticalGeneration,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/bold-vertical-types';
import {
  SAME_ORIGIN_SCRIPTLESS_SANDBOX,
  stripSrcDocScripts,
} from '@/app/(product-pipeline)/product-pipeline/_shared/lib/preview-sandbox';

interface Props {
  productId: string;
  templateCss: string;
  selectedKidsPlayfulId: string | null;
  selectedBoldVerticalId: string | null;
  selectedAgentId: string | null;
  registrationWorkspaceId?: string | null;
  initialAgentHistory?: GenerationHistoryItem[];
  generationHistoryQueryEnabled?: boolean;
  onSelectKidsPlayful: (id: string | null) => void;
  onSelectBoldVertical: (id: string | null) => void;
  onSelectAgent: (id: string | null) => void;
}

/** 통합 리스트 row — ContentAgent / Trend / KIDITEM 동일 인터페이스로 표시. */
type UnifiedRow =
  | { kind: 'ca'; item: GenerationHistoryItem; createdAt: string }
  | { kind: 'kp'; entry: KidsPlayfulGenerationItem; createdAt: string }
  | { kind: 'bold'; entry: KidsPlayfulGenerationItem; createdAt: string };

function StatusBadge({ status }: { status: string }) {
  if (status === 'COMPLETED' || status === 'READY') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <CheckCircle2 size={10} />
        완료
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        <XCircle size={10} />
        실패
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      <Clock size={10} />
      {status}
    </span>
  );
}

function isCompletedDetailGenerationStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === 'COMPLETED' || normalized === 'READY';
}

function renderGenerationEntryHtml(entry: KidsPlayfulGenerationItem, templateCss: string): string {
  if (entry.templateId === 'bold-vertical') {
    const adapted = adaptBoldVerticalToDetailPageData(
      entry.result as unknown as BoldVerticalGeneration,
      entry.imageUrls,
      entry.processedImages,
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
  }
  return buildKidsPlayfulHtml(rowToRendererData(entry), templateCss);
}

export default function GenerationHistoryTab({
  productId,
  templateCss,
  selectedKidsPlayfulId,
  selectedBoldVerticalId,
  selectedAgentId,
  registrationWorkspaceId = null,
  initialAgentHistory,
  generationHistoryQueryEnabled = true,
  onSelectKidsPlayful,
  onSelectBoldVertical,
  onSelectAgent,
}: Props) {
  const queryClient = useQueryClient();
  const { data: history = [], isLoading, error } = useGenerationHistory(
    productId,
    initialAgentHistory,
    { enabled: generationHistoryQueryEnabled },
  );
  const deleteKp = useKidsPlayfulGenerationDelete();
  const deleteCa = useGenerationHistoryDelete(productId);
  /** "ca:{id}" 또는 "kp:{id}" — 좌측 리스트 클릭 강조 */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  const handleDeleteKp = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 생성 이력을 삭제할까요?')) return;
    deleteKp.mutate(id, {
      onSuccess: () => {
        if (selectedKey === `kp:${id}`) setSelectedKey(null);
        if (selectedKey === `bold:${id}`) setSelectedKey(null);
        if (selectedKidsPlayfulId === id) onSelectKidsPlayful(null);
        if (selectedBoldVerticalId === id) onSelectBoldVertical(null);
      },
      onError: (err) => {
        toast.error(isApiError(err) ? err.detail : '삭제 실패');
      },
    });
  };

  const handleDeleteCa = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 생성 이력을 삭제할까요?')) return;
    deleteCa.mutate(id, {
      onSuccess: () => {
        if (selectedKey === `ca:${id}`) setSelectedKey(null);
        if (selectedAgentId === id) onSelectAgent(null);
      },
      onError: (err) => {
        toast.error(isApiError(err) ? err.detail : '삭제 실패');
      },
    });
  };

  // Trend / KIDITEM 이력 (이 product) — server DB 에서 조회.
  const { data: kpEntries = [] } = useKidsPlayfulGenerationList(productId, {
    enabled: generationHistoryQueryEnabled,
  });
  const { data: boldEntries = [] } = useBoldVerticalGenerationList(productId, {
    enabled: generationHistoryQueryEnabled,
  });

  // 통합 리스트 — createdAt 내림차순.
  const rows: UnifiedRow[] = useMemo(() => {
    const all: UnifiedRow[] = [
      ...history.map((item) => ({
        kind: 'ca' as const,
        item,
        createdAt: item.createdAt,
      })),
      ...kpEntries.map((entry) => ({
        kind: 'kp' as const,
        entry,
        createdAt: entry.createdAt,
      })),
      ...boldEntries.map((entry) => ({
        kind: 'bold' as const,
        entry,
        createdAt: entry.createdAt,
      })),
    ];
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [history, kpEntries, boldEntries]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    if (selectedKey.startsWith('ca:')) {
      const id = selectedKey.slice(3);
      const item = history.find((h) => h.id === id);
      return item ? ({ kind: 'ca' as const, item } as const) : null;
    }
    if (selectedKey.startsWith('kp:')) {
      const id = selectedKey.slice(3);
      const entry = kpEntries.find((e) => e.id === id);
      return entry ? ({ kind: 'kp' as const, entry } as const) : null;
    }
    if (selectedKey.startsWith('bold:')) {
      const id = selectedKey.slice(5);
      const entry = boldEntries.find((e) => e.id === id);
      return entry ? ({ kind: 'bold' as const, entry } as const) : null;
    }
    return null;
  }, [selectedKey, history, kpEntries, boldEntries]);

  const selectedCaGenerationId = selected?.kind === 'ca' ? selected.item.id : null;
  const { data: selectedGenerationEntry } = useKidsPlayfulOne(selectedCaGenerationId);
  const { data: selectedCaEditedHtml, isLoading: isSelectedCaHtmlLoading } = useQuery({
    queryKey: selectedCaGenerationId
      ? queryKeys.productContent.generationEditedHtml(selectedCaGenerationId)
      : queryKeys.productContent.generationEditedHtml(''),
    queryFn: () => {
      if (!selectedCaGenerationId) {
        throw new Error('detail page generation id is required');
      }
      return apiClient.get<{ html: string | null; savedAt: string | null }>(
        `/api/ai/detail-page/${selectedCaGenerationId}/edited-html`,
      );
    },
    enabled: !!selectedCaGenerationId,
    staleTime: 30_000,
  });

  const buildSelectedHtml = useCallback(
    (target: NonNullable<typeof selected>) => {
      if (target.kind === 'kp') {
        return buildKidsPlayfulHtml(rowToRendererData(target.entry), templateCss);
      }
      if (target.kind === 'bold') {
        const adapted = adaptBoldVerticalToDetailPageData(
          target.entry.result as unknown as BoldVerticalGeneration,
          target.entry.imageUrls,
          target.entry.processedImages,
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
      }
      if (selectedCaGenerationId === target.item.id && selectedCaEditedHtml?.html) {
        return selectedCaEditedHtml.html;
      }
      if (
        selectedCaGenerationId === target.item.id &&
        selectedGenerationEntry &&
        isCompletedDetailGenerationStatus(selectedGenerationEntry.imageProcessingStatus)
      ) {
        return renderGenerationEntryHtml(selectedGenerationEntry, templateCss);
      }
      if (!target.item.detailPageData) {
        throw new Error('선택한 이력에 상세페이지 데이터가 없습니다.');
      }
      return buildGenerationHistoryHtml(target.item, templateCss);
    },
    [selectedCaEditedHtml?.html, selectedCaGenerationId, selectedGenerationEntry, templateCss],
  );

  const handleApplySelected = useCallback(async () => {
    if (!selectedKey || !selected) return;
    try {
      setApplyingKey(selectedKey);
      if (selected.kind === 'ca' && selected.item.detailPageArtifactId) {
        if (registrationWorkspaceId) {
          await registrationWorkspacesApi.selectCurrentDetailPage(
            registrationWorkspaceId,
            selected.item.id,
          );
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.registrationWorkspaces.detail(registrationWorkspaceId),
            }),
            queryClient.invalidateQueries({ queryKey: queryKeys.registrationWorkspaces.all }),
          ]);
        }
        onSelectAgent(selected.item.id);
        toast.success('선택한 상세페이지를 등록 상세로 적용했습니다.');
        return;
      }

      const html = buildSelectedHtml(selected);
      if (selected.kind === 'ca' && selectedCaEditedHtml?.html) {
        onSelectAgent(selected.item.id);
        toast.success('선택한 상세페이지를 등록 상세로 적용했습니다.');
        return;
      }
      const savePath =
        selected.kind === 'ca'
          ? `/api/ai/detail-page/${selected.item.id}/edited-html`
          : `/api/products/${productId}/edited-html`;
      await apiClient.post<{ ok: true }>(savePath, { html });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['edited-html', productId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.preview(productId) }),
      ]);

      if (selected.kind === 'kp') onSelectKidsPlayful(selected.entry.id);
      else if (selected.kind === 'bold') onSelectBoldVertical(selected.entry.id);
      else onSelectAgent(selected.item.id);

      toast.success('선택한 상세페이지를 적용했습니다.');
    } catch (err) {
      const msg =
        isApiError(err)
          ? err.detail
          : err instanceof Error
            ? err.message
            : '상세페이지 적용 실패';
      toast.error(msg);
    } finally {
      setApplyingKey(null);
    }
  }, [
    buildSelectedHtml,
    onSelectAgent,
    onSelectKidsPlayful,
    onSelectBoldVertical,
    productId,
    queryClient,
    registrationWorkspaceId,
    selected,
    selectedCaEditedHtml?.html,
    selectedKey,
  ]);

  // 선택된 row 의 미리보기 HTML. 생성 이력 탭에서는 원본 템플릿으로 fallback 하지 않는다.
  const previewHtml = useMemo(() => {
    if (!selected || selected.kind !== 'ca') return null;
    if (selectedCaEditedHtml?.html) {
      return ensureStyledDetailHtml(selectedCaEditedHtml.html, templateCss);
    }
    if (
      selectedGenerationEntry &&
      isCompletedDetailGenerationStatus(selectedGenerationEntry.imageProcessingStatus)
    ) {
      try {
        return renderGenerationEntryHtml(selectedGenerationEntry, templateCss);
      } catch {
        // Fall through to legacy row data.
      }
    }
    if (!selected.item.detailPageData) return null;
    try {
      return buildGenerationHistoryHtml(selected.item, templateCss);
    } catch {
      return null;
    }
  }, [selected, selectedCaEditedHtml?.html, selectedGenerationEntry, templateCss]);

  const safePreviewHtml = useMemo(
    () => (previewHtml ? stripSrcDocScripts(previewHtml) : null),
    [previewHtml],
  );

  const safeSelectedBoldPreviewHtml = useMemo(() => {
    if (!selected || selected.kind !== 'bold') return null;
    try {
      return stripSrcDocScripts(buildSelectedHtml(selected));
    } catch {
      return '<html><body>KIDITEM preview error</body></html>';
    }
  }, [selected, buildSelectedHtml]);

  const safeSelectedKpPreviewHtml = useMemo(() => {
    if (!selected || selected.kind !== 'kp') return null;
    try {
      return stripSrcDocScripts(buildSelectedHtml(selected));
    } catch {
      return '<html><body>Trend preview error</body></html>';
    }
  }, [selected, buildSelectedHtml]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        이력 불러오는 중...
      </div>
    );
  }

  if (error && rows.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
        <AlertCircle size={32} />
        <p className="text-sm font-medium">이력 로드 실패</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
        <AlertCircle size={32} />
        <p className="text-sm font-medium">아직 생성 이력이 없습니다</p>
        <p className="text-xs">상세페이지를 생성하면 여기에 시간순으로 쌓입니다.</p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-[300px_1fr] gap-3 p-5"
      style={{ height: 'calc(100vh - 110px)' }}
    >
      {/* 좌측: 이력 리스트 (ContentAgent + Kids Playful 통합) — flex column 으로 액션바를 하단에 고정. */}
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600 shrink-0">
          최근 {rows.length} 개
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {rows.map((row, idx) => {
            const isLatest = idx === 0;
            if (row.kind === 'ca') {
              const { item } = row;
              const key = `ca:${item.id}`;
              const isSelected = selectedKey === key;
              const isApplied = selectedAgentId === item.id;
              const templateLabel = generatedDetailTemplateLabel(item);
              return (
                <li key={key}>
                  <button
                    onClick={() => setSelectedKey(isSelected ? null : key)}
                    className={cn(
                      'w-full px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
                      isSelected && 'bg-violet-50 hover:bg-violet-50',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <StatusBadge status={item.status} />
                      <div className="flex items-center gap-1.5">
                        {isApplied && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                            <CheckCircle2 size={9} />
                            등록 상세
                          </span>
                        )}
                        <span className="text-[9px] font-bold tracking-wider text-slate-400">
                          {templateLabel}
                        </span>
                      </div>
                    </div>
                    <p
                      className="line-clamp-2 text-xs font-semibold text-slate-900"
                      title={item.generatedTitle ?? ''}
                    >
                      {item.generatedTitle ||
                        (item.status === 'FAILED' ? '(생성 실패)' : '(제목 없음)')}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatDateTime(new Date(item.createdAt))}
                    </p>
                    {item.errorMessage && (
                      <p
                        className="mt-1 line-clamp-1 text-[10px] text-red-600"
                        title={item.errorMessage}
                      >
                        {item.errorMessage}
                      </p>
                    )}
                  </button>
                </li>
              );
            }
            if (row.kind === 'kp') {
              // KP row
              const { entry } = row;
              const key = `kp:${entry.id}`;
              const isSelected = selectedKey === key;
              const isApplied = selectedKidsPlayfulId === entry.id;
              const r = entry.result as unknown as { section1?: { mainHeadline?: string; subhead?: string } };
              return (
                <li key={key}>
                  <button
                    onClick={() => setSelectedKey(isSelected ? null : key)}
                    className={cn(
                      'w-full px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
                      isSelected && 'bg-violet-50 hover:bg-violet-50',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                        <Sparkles size={9} />
                        TREND VERTICAL
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isApplied && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                            <CheckCircle2 size={9} />
                            미리보기 적용
                          </span>
                        )}
                        {isLatest && (
                          <span className="text-[9px] font-bold tracking-wider text-violet-500">
                            최신
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="line-clamp-2 text-xs font-semibold text-slate-900">
                      {r.section1?.mainHeadline}
                    </p>
                    <p className="line-clamp-1 text-[10px] text-slate-500">
                      {r.section1?.subhead}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatDateTime(new Date(entry.createdAt))}
                    </p>
                  </button>
                </li>
              );
            }
            // KIDITEM row
            const { entry } = row;
            const key = `bold:${entry.id}`;
            const isSelected = selectedKey === key;
            const isApplied = selectedBoldVerticalId === entry.id;
            const bold = entry.result as unknown as BoldVerticalGeneration;
            return (
              <li key={key}>
                <button
                  onClick={() => setSelectedKey(isSelected ? null : key)}
                  className={cn(
                    'w-full px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
                    isSelected && 'bg-sky-50 hover:bg-sky-50',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                      KIDITEM DESIGN
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isApplied && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          <CheckCircle2 size={9} />
                          미리보기 적용
                        </span>
                      )}
                      {isLatest && (
                        <span className="text-[9px] font-bold tracking-wider text-sky-500">
                          최신
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="line-clamp-2 text-xs font-semibold text-slate-900">
                    {bold?.hook?.text}
                  </p>
                  <p className="line-clamp-1 text-[10px] text-slate-500">
                    {bold?.hook?.subtext}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {formatDateTime(new Date(entry.createdAt))}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        {/* 하단 액션 바 — 선택된 row 에 적용/삭제. flex column 의 마지막 자식 → 항상 하단 고정. */}
        <div className="border-t border-slate-200 bg-white p-2 flex gap-2 shrink-0">
          {(() => {
            if (!selectedKey) {
              return (
                <p className="text-[11px] text-slate-400 text-center w-full py-1">
                  등록할 상세페이지를 선택하세요
                </p>
              );
            }
            const kind: 'kp' | 'bold' | 'ca' = selectedKey.startsWith('kp:')
              ? 'kp'
              : selectedKey.startsWith('bold:')
                ? 'bold'
                : 'ca';
            const id = kind === 'bold' ? selectedKey.slice(5) : selectedKey.slice(3);
            const isApplied =
              kind === 'kp'
                ? selectedKidsPlayfulId === id
                : kind === 'bold'
                  ? selectedBoldVerticalId === id
                  : selectedAgentId === id;
            const isApplying = applyingKey === selectedKey;
            const selectedCaHasArtifact =
              kind === 'ca' &&
              selected?.kind === 'ca' &&
              selected.item.id === id &&
              !!selected.item.detailPageArtifactId;
            const isPreparing = kind === 'ca' && !selectedCaHasArtifact && isSelectedCaHtmlLoading;
            const isRegistrationDetail = kind === 'ca';
            const applyColor =
              kind === 'kp'
                ? 'bg-violet-600 hover:bg-violet-700'
                : kind === 'bold'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : 'bg-indigo-600 hover:bg-indigo-700';
            return (
              <>
                <button
                  type="button"
                  onClick={() => void handleApplySelected()}
                  disabled={isApplied || isApplying || isPreparing}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition-colors text-white',
                    isApplied || isApplying || isPreparing
                      ? 'bg-emerald-500 cursor-default'
                      : applyColor,
                  )}
                >
                  {isPreparing ? (
                    <>
                      <Clock size={12} />
                      불러오는 중...
                    </>
                  ) : isApplying ? (
                    <>
                      <Clock size={12} />
                      {isRegistrationDetail ? '등록 적용 중...' : '적용 중...'}
                    </>
                  ) : isApplied ? (
                    <>
                      <CheckCircle2 size={12} />
                      {isRegistrationDetail ? '등록 상세페이지' : '미리보기 적용됨'}
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} />
                      {isRegistrationDetail ? '등록 상세로 적용' : '미리보기에 적용'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    if (kind === 'kp' || kind === 'bold') handleDeleteKp(id, e);
                    else handleDeleteCa(id, e);
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                  title="선택한 항목 삭제"
                >
                  <Trash2 size={12} />
                </button>
              </>
            );
          })()}
        </div>
      </div>

      {/* 우측: 미리보기 — 생성 유형과 관계없이 저장/편집 경로와 같은 HTML srcDoc 으로 표시. */}
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
          <Eye size={12} />
          {selected
            ? selected.kind === 'kp'
              ? `트렌드 광고형 템플릿 — ${formatDateTime(new Date(selected.entry.createdAt))}`
              : selected.kind === 'bold'
                ? `KIDITEM DESIGN — ${formatDateTime(new Date(selected.entry.createdAt))}`
                : `${generatedDetailTemplateLabel(selected.item)} — ${formatDateTime(new Date(selected.item.createdAt))}`
            : '생성 결과 선택 필요'}
        </div>
        <div className="flex-1 overflow-y-auto">
          {selected?.kind === 'kp' ? (
            <iframe
              srcDoc={safeSelectedKpPreviewHtml ?? '<html><body>Trend preview error</body></html>'}
              className="h-full w-full border-0"
              title="trend-preview"
              sandbox={SAME_ORIGIN_SCRIPTLESS_SANDBOX}
            />
          ) : selected?.kind === 'bold' ? (
            <iframe
              srcDoc={safeSelectedBoldPreviewHtml ?? '<html><body>KIDITEM preview error</body></html>'}
              className="h-full w-full border-0"
              title="bold-preview"
              sandbox={SAME_ORIGIN_SCRIPTLESS_SANDBOX}
            />
          ) : safePreviewHtml ? (
            <iframe
              srcDoc={safePreviewHtml}
              className="h-full w-full border-0"
              title="history-preview"
              sandbox={SAME_ORIGIN_SCRIPTLESS_SANDBOX}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              미리볼 생성 결과가 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
