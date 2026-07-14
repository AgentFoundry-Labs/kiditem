import { Loader2 } from 'lucide-react';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';
import type { ThumbnailTrackingRecord } from '../hooks/useThumbnailTracking';
import { isApplied, isReady } from '../../_shared/lib/thumbnail-status';
import { pickDisplayableImageUrl } from '@/lib/resolve-url';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCard } from '../../_shared/components/thumbnails/ProductCard';
import { PaginationBar } from './PaginationBar';
import { ThumbnailStatusBadge } from '../../_shared/components/thumbnails/ThumbnailStatusBadge';
import { TrackingTab } from './TrackingTab';

type HistorySubTab = 'history' | 'tracking';

interface HistoryTabProps {
  subTab: HistorySubTab;
  onChangeSubTab: (s: HistorySubTab) => void;
  historyByProduct: ThumbnailGenerationItem[];
  pagedHistory: ThumbnailGenerationItem[];
  page: number;
  totalPages: number;
  pageSize: number;
  onChangePage: (p: number) => void;
  onChangePageSize: (s: number) => void;
  onSelectGen: (g: ThumbnailGenerationItem) => void;
  trackingLoading: boolean;
  trackingItems: ThumbnailTrackingRecord[];
  trackingTotal: number;
}

export function HistoryTab({
  subTab,
  onChangeSubTab,
  historyByProduct,
  pagedHistory,
  page,
  totalPages,
  pageSize,
  onChangePage,
  onChangePageSize,
  onSelectGen,
  trackingLoading,
  trackingItems,
  trackingTotal,
}: HistoryTabProps) {
  const subTabs = [
    {
      key: 'history' as const,
      label: '편집 이력',
      count: historyByProduct.length,
    },
    { key: 'tracking' as const, label: '추적 분석', count: trackingTotal },
  ];

  return (
    <div className="space-y-4">
      <div
        className="flex gap-1 p-1 rounded-xl w-fit"
        style={{
          background: 'var(--thumb-surface-sunken)',
          border: '1px solid var(--thumb-border-subtle)',
        }}
      >
        {subTabs.map((st) => (
          <button
            key={st.key}
            onClick={() => onChangeSubTab(st.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors"
            style={
              subTab === st.key
                ? {
                    background: 'var(--thumb-card-bg)',
                    color: 'var(--thumb-primary)',
                    boxShadow: 'var(--thumb-shadow-sm)',
                  }
                : { color: 'var(--thumb-text-tertiary)' }
            }
          >
            {st.label}
            {st.count > 0 && (
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                style={
                  subTab === st.key
                    ? {
                        background: 'var(--thumb-surface-sunken)',
                        color: 'var(--thumb-primary)',
                      }
                    : {
                        background: 'var(--thumb-border-subtle)',
                        color: 'var(--thumb-text-tertiary)',
                      }
                }
              >
                {st.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {subTab === 'history' && (
        <div className="space-y-3">
          {historyByProduct.length === 0 ? (
            <EmptyState message="편집 이력이 없습니다" />
          ) : (
            <>
              <PaginationBar
                current={page}
                total={totalPages}
                count={historyByProduct.length}
                pageSize={pageSize}
                onChange={onChangePage}
                onPageSizeChange={onChangePageSize}
              />
              <div className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
                {pagedHistory.map((gen) => (
                  <ProductCard
                    key={gen.id}
                    imageUrl={pickDisplayableImageUrl(gen.selectedUrl, gen.originalUrl, gen.contentWorkspace?.imageUrl)}
                    name={gen.contentWorkspace?.name ?? '상품 정보 없음'}
                    badge={<ThumbnailStatusBadge status={gen.status} phase={gen.phase ?? null} />}
                    overlay={
                      gen.status === 'running' || gen.status === 'pending'
                        ? 'generating'
                        : isApplied(gen)
                          ? 'applied'
                          : gen.status === 'cancelled'
                            ? 'skipped'
                            : isReady(gen)
                              ? 'selected'
                              : undefined
                    }
                    onClick={() => onSelectGen(gen)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {subTab === 'tracking' &&
        (trackingLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={24} className="animate-spin mr-2" />
            <span className="text-sm">추적 데이터 로딩 중...</span>
          </div>
        ) : (
          <TrackingTab records={trackingItems} />
        ))}
    </div>
  );
}
