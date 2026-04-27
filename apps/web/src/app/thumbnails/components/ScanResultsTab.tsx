import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Wand2, Zap } from 'lucide-react';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared';
import { isReady } from '@/lib/thumbnail-status';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCard } from './ProductCard';
import { PaginationBar } from './PaginationBar';
import { buildEditHref } from '@/app/thumbnail-editor/edit/lib/build-edit-href';
import {
  getEffectiveComplianceGrade,
  getPrimaryViolationSummary,
  hasConfirmedComplianceFailure,
  needsThumbnailFix,
} from '../lib/thumbnail-classification';

interface ScanResultsTabProps {
  mode: 'all' | 'needsfix';
  classifiedResults: ThumbnailAnalysisResult[];
  needsFixProducts: ThumbnailAnalysisResult[];
  needsFixCount: number;
  filtered: ThumbnailAnalysisResult[];
  paged: ThumbnailAnalysisResult[];
  page: number;
  totalPages: number;
  pageSize: number;
  gradeFilter: string;
  gradeDistribution: Record<string, number>;
  genByProductId: Map<string, ThumbnailGenerationItem>;
  selectedNeedsFixIds: Set<string>;
  onToggleNeedsFix: (id: string) => void;
  onSelectAllUnEdited: (ids: string[] | null) => void;
  aiResults: Record<string, ThumbnailAnalysisResult>;
  batchAnalyzing: boolean;
  onChangePage: (p: number) => void;
  onChangePageSize: (s: number) => void;
  onChangeGradeFilter: (f: string) => void;
  onSelectProduct: (p: ThumbnailAnalysisResult) => void;
  onShowAiEditTab: () => void;
  onRunBatchPaged: () => void;
}

export function ScanResultsTab({
  mode,
  classifiedResults,
  needsFixProducts,
  needsFixCount,
  filtered,
  paged,
  page,
  totalPages,
  pageSize,
  gradeFilter,
  gradeDistribution,
  genByProductId,
  selectedNeedsFixIds,
  onToggleNeedsFix,
  onSelectAllUnEdited,
  aiResults,
  batchAnalyzing,
  onChangePage,
  onChangePageSize,
  onChangeGradeFilter,
  onSelectProduct,
  onShowAiEditTab,
  onRunBatchPaged,
}: ScanResultsTabProps) {
  const editPendingCount = needsFixProducts.filter((r) => {
    const g = genByProductId.get(r.productId);
    return g && (g.status === 'pending' || g.status === 'running');
  }).length;
  const editReadyCount = needsFixProducts.filter((r) => {
    const g = genByProductId.get(r.productId);
    return g && isReady(g);
  }).length;
  const editFailedCount = needsFixProducts.filter((r) => {
    const g = genByProductId.get(r.productId);
    return g && g.status === 'failed';
  }).length;
  const complianceFailCount = needsFixProducts.filter(hasConfirmedComplianceFailure).length;
  const unEditedProducts = needsFixProducts.filter((r) => {
    const g = genByProductId.get(r.productId);
    return !g || g.status === 'failed';
  });
  const allUnEditedSelected =
    unEditedProducts.length > 0 &&
    unEditedProducts.every((r) => selectedNeedsFixIds.has(r.productId));

  const aiResultsCount = Object.keys(aiResults).length;

  // 'all' 탭은 위반/품질미달 제외 — page.tsx 의 base 와 동일 정책. (라벨 카운트 정합용)
  const cleanResults = useMemo(
    () => classifiedResults.filter((r) => !needsThumbnailFix(r)),
    [classifiedResults],
  );
  const cleanGradeDistribution = useMemo(
    () =>
      cleanResults.reduce<Record<string, number>>(
        (acc, r) => {
          if (r.grade) acc[r.grade] = (acc[r.grade] ?? 0) + 1;
          return acc;
        },
        { S: 0, A: 0, B: 0, C: 0, F: 0 },
      ),
    [cleanResults],
  );

  return (
    <div className="space-y-3">
      {mode === 'needsfix' && (
        <div className="space-y-2">
          <div
            className="flex items-center justify-between p-3 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)' }}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
              <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>
                개선 필요 {needsFixCount}개
              </span>
              <span className="text-xs" style={{ color: 'var(--thumb-text-tertiary)' }}>
                가이드라인 위반 {complianceFailCount}개
              </span>
            </div>
            {unEditedProducts.length > 0 && (
              <button
                onClick={() => {
                  if (allUnEditedSelected) onSelectAllUnEdited(null);
                  else onSelectAllUnEdited(unEditedProducts.map((r) => r.productId));
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={
                  allUnEditedSelected
                    ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
                    : {
                        background: 'var(--thumb-card-bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--thumb-text-secondary)',
                      }
                }
              >
                {allUnEditedSelected ? '전체 해제' : `전체 선택 (${unEditedProducts.length})`}
              </button>
            )}
          </div>
          <FilterBar
            tabs={[
              { key: 'all', label: `전체 (${needsFixCount})` },
              { key: 'FAIL', label: `위반 (${needsFixProducts.filter((r) => getEffectiveComplianceGrade(r) === 'FAIL').length})` },
              { key: 'WARN', label: `주의 (${needsFixProducts.filter((r) => getEffectiveComplianceGrade(r) === 'WARN').length})` },
              { key: 'edit-pending', label: `편집 중 (${editPendingCount})` },
              { key: 'edit-ready', label: `편집 완료 (${editReadyCount})` },
              { key: 'edit-failed', label: `편집 실패 (${editFailedCount})` },
            ]}
            current={gradeFilter}
            onChange={onChangeGradeFilter}
          />
        </div>
      )}

      {mode === 'all' && (
        <FilterBar
          tabs={[
            // "전체" = 위반/품질미달 제외한 정상 분류만. grade(S/A/B/C/F) 도 동일 기준.
            { key: 'all', label: `전체 (${cleanResults.length})` },
            ...['S', 'A', 'B', 'C', 'F'].map((g) => ({
              key: g,
              label: `${g} (${cleanGradeDistribution[g] || 0})`,
            })),
            // 위반 필터는 cleanResults 가 아니라 전체 분석건 기준 — 클릭 시 page 가 base 를
            // needsFix 로 스위칭해서 위반만 노출 (격리는 유지하되 진입점은 보존).
            { key: 'FAIL', label: `위반 (${classifiedResults.filter((r) => getEffectiveComplianceGrade(r) === 'FAIL').length})` },
            { key: 'WARN', label: `주의 (${cleanResults.filter((r) => getEffectiveComplianceGrade(r) === 'WARN').length})` },
            { key: 'PASS', label: `적합 (${cleanResults.filter((r) => getEffectiveComplianceGrade(r) === 'PASS').length})` },
          ]}
          current={gradeFilter}
          onChange={onChangeGradeFilter}
        />
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onRunBatchPaged}
              disabled={batchAnalyzing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: '#3182f6' }}
            >
              {batchAnalyzing ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> 분석 중...
                </>
              ) : (
                <>
                  <Zap size={12} /> 현재 페이지 재분석
                </>
              )}
            </button>
            {aiResultsCount > 0 && (
              <span className="text-[11px] font-mono" style={{ color: 'var(--thumb-text-tertiary)' }}>
                AI 분석 완료: {aiResultsCount}개
              </span>
            )}
          </div>
          <PaginationBar
            current={page}
            total={totalPages}
            count={filtered.length}
            pageSize={pageSize}
            onChange={onChangePage}
            onPageSizeChange={onChangePageSize}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState message="해당 조건의 상품이 없습니다" />
      ) : (
        <div className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
          {paged.map((item) => {
            const display = aiResults[item.productId] || item;
            const isAiDone = !!aiResults[item.productId];
            const itemGen = genByProductId.get(item.productId);
            const isEditing = itemGen && (itemGen.status === 'running' || itemGen.status === 'pending');
            const itemReady = itemGen && isReady(itemGen);
            const violationSummary = getPrimaryViolationSummary(display);
            const effectiveComplianceGrade = getEffectiveComplianceGrade(display);
            const showRedWarning = hasConfirmedComplianceFailure(display);
            const showAmberWarning =
              display.complianceGrade === 'FAIL' && effectiveComplianceGrade === 'WARN';
            return (
              <div key={item.productId} className="flex flex-col gap-1">
                <ProductCard
                  imageUrl={item.imageUrl}
                  name={item.productName}
                  grade={display.grade}
                  score={display.overallScore}
                  complianceGrade={effectiveComplianceGrade ?? undefined}
                  aiAnalyzed={isAiDone}
                  ctr={item.ctr ?? null}
                  overlay={isEditing ? 'generating' : itemReady ? 'selected' : undefined}
                  onClick={() => onSelectProduct(item)}
                />
                {/* 하단 알림 슬롯 — 모든 카드가 동일한 높이를 가지도록 항상 렌더 */}
                <div className="min-h-[28px]">
                  {showRedWarning && (
                    <div
                      className="flex items-start gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-[11px] leading-4 text-red-700"
                      title={violationSummary ?? '위반 근거 없음'}
                    >
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-2">
                        {violationSummary ?? '위반 근거 없음 · 재분석 필요'}
                      </span>
                    </div>
                  )}
                  {showAmberWarning && (
                    <div className="flex items-start gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-700">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-2">위반 근거 부족 · 재분석 필요</span>
                    </div>
                  )}
                </div>
                {mode === 'needsfix' &&
                  (isEditing ? (
                    <div className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                      <Loader2 size={10} className="animate-spin" /> 편집 중
                    </div>
                  ) : itemReady ? (
                    <button
                      onClick={onShowAiEditTab}
                      className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-purple-600 text-white hover:bg-purple-700"
                    >
                      <Wand2 size={10} /> 결과 확인하기
                    </button>
                  ) : (
                    <NeedsFixSelector
                      productId={item.productId}
                      imageUrl={item.imageUrl}
                      isSelected={selectedNeedsFixIds.has(item.productId)}
                      onToggle={onToggleNeedsFix}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  tabs,
  current,
  onChange,
}: {
  tabs: Array<{ key: string; label: string }>;
  current: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
          style={
            current === tab.key
              ? { background: 'var(--thumb-primary)', color: '#fff' }
              : {
                  background: 'var(--thumb-card-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--thumb-text-secondary)',
                }
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function NeedsFixSelector({
  productId,
  imageUrl,
  isSelected,
  onToggle,
}: {
  productId: string;
  imageUrl: string | null;
  isSelected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(productId);
        }}
        className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold border-2 transition-all ${
          isSelected
            ? 'bg-amber-500 border-amber-500 text-white'
            : 'bg-white border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-500'
        }`}
      >
        {isSelected ? <CheckCircle size={10} /> : null}
        {isSelected ? '선택됨' : '선택'}
      </button>
      {isSelected && (
        <Link
          href={buildEditHref({ productId, imageUrl })}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100">
            <Wand2 size={10} /> AI 편집하러가기
          </button>
        </Link>
      )}
    </div>
  );
}
