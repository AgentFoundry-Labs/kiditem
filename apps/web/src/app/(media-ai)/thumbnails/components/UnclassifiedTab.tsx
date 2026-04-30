import { Loader2, Zap } from 'lucide-react';
import type { ThumbnailAnalysisResult } from '@kiditem/shared/ai';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCard } from '../../_shared/components/thumbnails/ProductCard';
import { PaginationBar } from './PaginationBar';
import type { AnalysisScope } from '../hooks/useThumbnailAnalysis';
import { getEffectiveComplianceGrade, needsThumbnailFix } from '../lib/thumbnail-classification';

type SubTab = 'with-image' | 'no-image' | 'new';

interface UnclassifiedTabProps {
  unclassifiedWithImage: ThumbnailAnalysisResult[];
  unclassifiedNoImage: ThumbnailAnalysisResult[];
  subTab: SubTab;
  onChangeSubTab: (s: SubTab) => void;
  page: number;
  pageSize: number;
  onChangePage: (p: number) => void;
  onChangePageSize: (s: number) => void;
  batchAnalyzing: boolean;
  aiResults: Record<string, ThumbnailAnalysisResult>;
  onRunBatch: (items: ThumbnailAnalysisResult[], scope?: AnalysisScope) => void;
  onSelectProduct: (product: ThumbnailAnalysisResult) => void;
}

export function UnclassifiedTab({
  unclassifiedWithImage,
  unclassifiedNoImage,
  subTab,
  onChangeSubTab,
  page,
  pageSize,
  onChangePage,
  onChangePageSize,
  batchAnalyzing,
  aiResults,
  onRunBatch,
  onSelectProduct,
}: UnclassifiedTabProps) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newProducts = [...unclassifiedWithImage, ...unclassifiedNoImage].filter(
    (r) => r.createdAt && new Date(r.createdAt).getTime() >= sevenDaysAgo,
  );

  const subTabs = [
    { key: 'with-image' as const, label: '이미지 있는 상품', count: unclassifiedWithImage.length, color: 'var(--thumb-primary)' },
    { key: 'no-image' as const, label: '이미지 없는 상품', count: unclassifiedNoImage.length, color: '#f59e0b' },
    { key: 'new' as const, label: '새로 등록된 상품', count: newProducts.length, color: '#00c471' },
  ];

  const currentItems =
    subTab === 'with-image'
      ? unclassifiedWithImage
      : subTab === 'no-image'
        ? unclassifiedNoImage
        : newProducts;

  const totalPages = Math.ceil(currentItems.length / pageSize);
  const pagedCurrent = currentItems.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--thumb-surface-sunken)' }}>
        {subTabs.map((st) => (
          <button
            key={st.key}
            onClick={() => onChangeSubTab(st.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors"
            style={
              subTab === st.key
                ? { background: 'var(--thumb-card-bg)', color: st.color, boxShadow: 'var(--thumb-shadow-sm)' }
                : { color: 'var(--thumb-text-tertiary)' }
            }
          >
            {st.label}
            {st.count > 0 && (
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                style={
                  subTab === st.key
                    ? { background: `${st.color}18`, color: st.color }
                    : { background: 'var(--thumb-border-subtle)', color: 'var(--thumb-text-secondary)' }
                }
              >
                {st.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {subTab === 'with-image' && unclassifiedWithImage.length > 0 && (
        <div
          className="flex items-center justify-between p-3 rounded-xl"
          style={{ background: 'var(--thumb-primary-subtle)', border: '1px solid rgba(49,130,246,0.15)' }}
        >
          <div className="flex items-center gap-2">
            <Zap size={16} style={{ color: 'var(--thumb-primary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--thumb-primary)' }}>
              {unclassifiedWithImage.length}개 — 썸네일 분류 필요
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRunBatch(unclassifiedWithImage)}
              disabled={batchAnalyzing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--thumb-primary)' }}
            >
              {batchAnalyzing ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> 분석 중...
                </>
              ) : (
                <>
                  <Zap size={14} /> 전체 분류 ({unclassifiedWithImage.length}개)
                </>
              )}
            </button>
            <button
              onClick={() => onRunBatch(pagedCurrent)}
              disabled={batchAnalyzing}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{ background: 'rgba(49,130,246,0.12)', color: 'var(--thumb-primary)' }}
            >
              <Zap size={14} /> 이 페이지 ({pagedCurrent.filter((i) => i.imageUrl).length}개)
            </button>
          </div>
        </div>
      )}

      {subTab === 'new' && newProducts.filter((r) => r.imageUrl).length > 0 && (
        <div
          className="flex items-center justify-between p-3 rounded-xl"
          style={{ background: '#00c47110', border: '1px solid #00c47130' }}
        >
          <div className="flex items-center gap-2">
            <Zap size={16} style={{ color: '#00c471' }} />
            <span className="text-sm font-semibold" style={{ color: '#00c471' }}>
              7일 이내 등록 {newProducts.length}개 — 우선 분류 추천
            </span>
          </div>
          <button
            onClick={() => onRunBatch(newProducts.filter((r) => !!r.imageUrl))}
            disabled={batchAnalyzing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
            style={{ background: '#00c471' }}
          >
            {batchAnalyzing ? (
              <>
                <Loader2 size={14} className="animate-spin" /> 분석 중...
              </>
            ) : (
              <>
                <Zap size={14} /> 신규 상품 전체 분류
              </>
            )}
          </button>
        </div>
      )}

      <PaginationBar
        current={page}
        total={totalPages}
        count={currentItems.length}
        pageSize={pageSize}
        onChange={onChangePage}
        onPageSizeChange={onChangePageSize}
      />

      {currentItems.length === 0 ? (
        <EmptyState
          message={
            subTab === 'with-image'
              ? '이미지 있는 미분류 상품이 없습니다'
              : subTab === 'no-image'
                ? '이미지 없는 상품이 없습니다'
                : '최근 7일 이내 등록된 미분류 상품이 없습니다'
          }
        />
      ) : (
        <div className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
          {pagedCurrent.map((item) => {
            const aiDone = !!aiResults[item.productId];
            const display = aiResults[item.productId] || item;
            return (
              <ProductCard
                key={item.productId}
                imageUrl={item.imageUrl}
                name={item.productName}
                grade={aiDone ? display.grade : undefined}
                score={aiDone ? display.overallScore : undefined}
                complianceGrade={aiDone ? (getEffectiveComplianceGrade(display) ?? undefined) : undefined}
                aiAnalyzed={aiDone}
                overlay={
                  !item.imageUrl
                    ? 'skipped'
                    : aiDone && needsThumbnailFix(display)
                      ? 'needs-fix'
                      : undefined
                }
                onClick={() => onSelectProduct(item)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
