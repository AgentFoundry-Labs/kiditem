'use client';

import { API_BASE } from '@/lib/api';
import { useEffect, useState, useCallback } from 'react';
import {
  ImageIcon,
  RefreshCw,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Scan,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';

interface ThumbnailIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

interface ThumbnailItem {
  id: string;
  productId: string;
  productName: string;
  company: string;
  imageUrl: string;
  ctr: number;
  prevCtr: number;
  impressions: number;
  clicks: number;
  status: string;
  strategy: string;
  grade: 'S' | 'A' | 'B' | 'C' | 'F';
  issues: ThumbnailIssue[];
  suggestions: string[];
}

interface GradeDistribution {
  S: number;
  A: number;
  B: number;
  C: number;
  F: number;
}

type FilterKey = 'all' | 'critical' | 'good';

const GRADE_COLORS: Record<string, string> = {
  S: 'text-emerald-500',
  A: 'text-blue-500',
  B: 'text-gray-500',
  C: 'text-amber-500',
  F: 'text-red-500',
};

const GRADE_LABELS: Record<string, string> = {
  S: 'EXCELLENT',
  A: 'GOOD',
  B: 'AVERAGE',
  C: 'POOR',
  F: 'CRITICAL',
};

const BADGE_COLORS: Record<string, string> = {
  S: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  A: 'bg-blue-100 text-blue-700 border-blue-200',
  B: 'bg-gray-100 text-gray-700 border-gray-200',
  C: 'bg-amber-100 text-amber-700 border-amber-200',
  F: 'bg-red-100 text-red-700 border-red-200',
};

export default function ThumbnailsPage() {
  const [items, setItems] = useState<ThumbnailItem[]>([]);
  const [total, setTotal] = useState(0);
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistribution>({ S: 0, A: 0, B: 0, C: 0, F: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey | string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
      const res = await fetch(`${API_BASE}/api/thumbnails?${params}`);
      const json = await res.json();
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
      if (json.summary?.gradeDistribution) {
        setGradeDistribution(json.summary.gradeDistribution);
      }
    } catch (err) {
      console.error('썸네일 데이터 로딩 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [page, fetchData]);

  const criticalCount = items.filter((i) => i.issues.some((iss) => iss.severity === 'critical')).length;
  const goodCount = items.filter((i) => i.grade === 'S' || i.grade === 'A').length;

  const filtered = (() => {
    if (filter === 'critical') return items.filter((i) => i.issues.some((iss) => iss.severity === 'critical'));
    if (filter === 'good') return items.filter((i) => i.grade === 'S' || i.grade === 'A');
    if (['S', 'A', 'B', 'C', 'F'].includes(filter)) return items.filter((i) => i.grade === filter);
    return items;
  })();

  const filterTabs: { key: string; label: string; className?: string }[] = [
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
          onClick={() => fetchData(page)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-md font-mono"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} /> RE-SCAN
        </button>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {(['S', 'A', 'B', 'C', 'F'] as const).map((g) => (
          <button
            key={g}
            onClick={() => setFilter(filter === g ? 'all' : g)}
            className={cn(
              'bg-white rounded-xl border border-gray-200 cursor-pointer transition-all hover:shadow-sm',
              filter === g && 'ring-2 ring-blue-400',
            )}
          >
            <div className="px-3 py-2.5 text-center">
              <div className={cn('text-2xl font-black', GRADE_COLORS[g])}>{g}</div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">
                {gradeDistribution[g] || 0}
              </div>
              <div className="text-[9px] text-gray-400 font-mono">{GRADE_LABELS[g]}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              filter === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
              tab.className && filter !== tab.key && tab.className,
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
            {filtered.map((item) => {
              const isExpanded = expandedId === item.productId;
              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.productId)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50/50 transition-colors"
                  >
                    <div className="w-14 h-14 rounded-lg bg-gray-50 flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {item.imageUrl && item.imageUrl.startsWith('http') ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={20} className="text-gray-200" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 truncate block">
                        {item.productName}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.issues
                          .filter((i) => i.severity === 'critical')
                          .slice(0, 2)
                          .map((issue, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded"
                            >
                              {issue.message.length > 30 ? `${issue.message.slice(0, 30)}...` : issue.message}
                            </span>
                          ))}
                        {item.issues.filter((i) => i.severity === 'warning').length > 0 && (
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            경고 {item.issues.filter((i) => i.severity === 'warning').length}건
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0">
                      <span className="font-mono tabular-nums">CTR {item.ctr.toFixed(2)}%</span>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border', BADGE_COLORS[item.grade])}>
                        <span className="text-lg font-black">{item.grade}</span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={14} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={14} className="text-gray-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50/30 space-y-3">
                      {item.issues.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono text-gray-500 uppercase mb-1.5">
                            발견된 이슈
                          </div>
                          <div className="space-y-1">
                            {item.issues.map((issue, idx) => (
                              <div
                                key={idx}
                                className={cn(
                                  'flex items-start gap-2 p-2 rounded-lg text-xs',
                                  issue.severity === 'critical'
                                    ? 'bg-red-50 text-red-800'
                                    : issue.severity === 'warning'
                                      ? 'bg-amber-50 text-amber-800'
                                      : 'bg-blue-50 text-blue-800',
                                )}
                              >
                                {issue.severity === 'critical' ? (
                                  <XCircle size={13} className="shrink-0 mt-0.5" />
                                ) : (
                                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                                )}
                                <span>{issue.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.suggestions.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono text-gray-500 uppercase mb-1.5">
                            개선 제안
                          </div>
                          <div className="space-y-1">
                            {item.suggestions.map((s, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs"
                              >
                                <Lightbulb size={13} className="shrink-0 mt-0.5 text-emerald-500" />
                                <span>{s}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-3 pt-1">
                        <div className="text-xs">
                          <span className="text-gray-500">노출수</span>
                          <span className="ml-2 font-medium text-gray-900">{item.impressions.toLocaleString()}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-gray-500">클릭수</span>
                          <span className="ml-2 font-medium text-gray-900">{item.clicks.toLocaleString()}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-gray-500">전략</span>
                          <span className="ml-2 font-medium text-gray-900">{item.strategy === 'premium' ? '프리미엄' : '표준'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
