'use client';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import type { ThumbnailListItem as ThumbnailItem, ThumbnailSummary } from '@kiditem/shared';
import { useState } from 'react';
import { Scan, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import { ThumbnailGradeCards } from './components/ThumbnailGradeCards';
import { ThumbnailFilterTabs } from './components/ThumbnailFilterTabs';
import { ThumbnailCard } from './components/ThumbnailCard';

type FilterKey = 'all' | 'critical' | 'good';

export default function ThumbnailsPage() {
  const [filter, setFilter] = useState<FilterKey | string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data: thumbData, isLoading: loading, refetch } = useQuery({
    queryKey: queryKeys.thumbnails.list({ page: String(page), limit: String(PAGE_SIZE) }),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      return apiClient.get<{ items: ThumbnailItem[]; total: number; summary?: ThumbnailSummary }>(`/api/thumbnails?${params}`);
    },
  });

  const items = thumbData?.items ?? [];
  const total = thumbData?.total ?? 0;
  const summary = thumbData?.summary ?? { total: 0, gradeDistribution: { S: 0, A: 0, B: 0, C: 0, F: 0 } };

  const criticalCount = items.filter((i) => i.issues.some((iss) => iss.severity === 'critical')).length;
  const goodCount = items.filter((i) => i.grade === 'S' || i.grade === 'A').length;

  const filtered = (() => {
    if (filter === 'critical') return items.filter((i) => i.issues.some((iss) => iss.severity === 'critical'));
    if (filter === 'good') return items.filter((i) => i.grade === 'S' || i.grade === 'A');
    if (['S', 'A', 'B', 'C', 'F'].includes(filter)) return items.filter((i) => i.grade === filter);
    return items;
  })();

  const filterTabs = [
    { key: 'all', label: `전체 (${total})` },
    { key: 'critical', label: `긴급개선 (${criticalCount})`, className: 'text-red-600' },
    { key: 'good', label: `우수 (${goodCount})`, className: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scan size={18} className="text-purple-500" />
          <div>
            <h1 className="text-base font-semibold text-gray-900 uppercase tracking-wide">
              Thumbnail AI Scanner
            </h1>
            <span className="text-xs text-gray-400 font-mono">
              {total}개 상품 분석 완료
            </span>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-md font-mono"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} /> RE-SCAN
        </button>
      </div>

      <ThumbnailGradeCards summary={summary} filter={filter} onFilterChange={setFilter} />
      <ThumbnailFilterTabs tabs={filterTabs} activeFilter={filter} onChange={setFilter} />

      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-500 font-mono text-sm">
          SCANNING THUMBNAILS...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          해당 조건의 상품이 없습니다
        </div>
      ) : (
        <div>
          <div className="space-y-2">
            {filtered.map((item) => (
              <ThumbnailCard
                key={item.id}
                item={item}
                isExpanded={expandedId === item.productId}
                onToggle={() => setExpandedId(expandedId === item.productId ? null : item.productId)}
              />
            ))}
          </div>
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
