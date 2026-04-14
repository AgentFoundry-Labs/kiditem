'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { roasColor } from '../../lib/status-colors';
import { cn, formatKRW } from '@/lib/utils';

const GRADE_STYLES: Record<string, { border: string; bg: string; pillBg: string; ring: string; headerGrad: string; adBadge: string }> = {
  A: { border: 'border-emerald-300', bg: 'bg-gradient-to-br from-emerald-50 to-green-50/50', pillBg: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-400', headerGrad: 'from-emerald-600 to-green-600', adBadge: 'bg-emerald-100 text-emerald-700' },
  B: { border: 'border-amber-300', bg: 'bg-gradient-to-br from-amber-50 to-yellow-50/50', pillBg: 'bg-amber-100 text-amber-700', ring: 'ring-amber-400', headerGrad: 'from-amber-500 to-yellow-500', adBadge: 'bg-amber-100 text-amber-700' },
  C: { border: 'border-red-300', bg: 'bg-gradient-to-br from-red-50 to-pink-50/50', pillBg: 'bg-red-100 text-red-700', ring: 'ring-red-400', headerGrad: 'from-red-500 to-pink-500', adBadge: 'bg-red-100 text-red-700' },
};

const PAGE_SIZE = 10;

interface StrategyRule {
  rule: string;
  grade?: string;
  priority?: string;
  action?: string;
  name?: string;
  roas?: number;
  spend?: number;
}

interface BudgetAllocationItem {
  grade: string;
  currentPercent: number;
  targetPercent: number;
  gap: number;
}

interface GradeProduct {
  id: string;
  name: string;
  adTier: string | null;
  coupangProductId: string | null;
  t14?: { revenue: number };
}

interface Props {
  budgetAllocation?: BudgetAllocationItem[];
  rules?: StrategyRule[];
}

// 등급별 상품 패널 (독립 페이지네이션)
function GradeProductPanel({
  grade,
  style,
  title,
  subtitle,
  pills,
  target,
  pct,
  rules,
  roasT,
}: {
  grade: string;
  style: typeof GRADE_STYLES['A'];
  title: string;
  subtitle: string;
  pills: string[];
  target: number;
  pct: number;
  rules: StrategyRule[];
  roasT: { excellent: number; warning: number; poor: number };
}) {
  const [page, setPage] = useState(0);

  const { data: products = [] } = useQuery({
    queryKey: queryKeys.products.list({ grade, limit: '200' }),
    queryFn: () =>
      apiClient.get<{ items: GradeProduct[] }>(`/api/products?grade=${grade}&limit=200`)
        .then((r) => r.items),
  });

  const totalPages = Math.ceil(products.length / PAGE_SIZE);
  const paged = products.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const urgents = rules.filter((r) => r.priority === 'urgent').length;

  const priOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sortedRules = [...rules].sort(
    (a, b) => (priOrder[a.priority as keyof typeof priOrder] ?? 3) - (priOrder[b.priority as keyof typeof priOrder] ?? 3),
  );

  return (
    <div className={cn('rounded-2xl border-2 overflow-hidden shadow-sm', style.border)}>
      {/* 헤더 */}
      <div className={cn('bg-gradient-to-r px-6 py-4 flex items-center justify-between', style.headerGrad)}>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-black text-white">{grade}</span>
          <div>
            <div className="text-base font-bold text-white leading-tight">{title}</div>
            <div className="text-sm text-white/80">{subtitle}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-white">{products.length}<span className="text-sm font-normal ml-1">개</span></div>
          <div className="text-xs text-white/80">상품</div>
        </div>
      </div>

      {/* 예산 비중 */}
      <div className={cn('px-6 py-3', style.bg)}>
        <div className="flex justify-between text-sm mb-1.5">
          <span className="font-medium text-slate-600">예산 비중</span>
          <span className="font-bold text-slate-800">
            {pct}% <span className="font-normal text-slate-400">/ 목표 {target}%</span>
          </span>
        </div>
        <div className="h-2 bg-white/60 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', style.headerGrad)}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {pills.map((pill) => (
            <span key={pill} className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold', style.pillBg)}>
              {pill}
            </span>
          ))}
        </div>
      </div>

      {/* 상품 목록 */}
      <div className="bg-white">
        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700">상품 목록</span>
          {totalPages > 1 && (
            <span className="text-xs text-slate-400">{page + 1} / {totalPages} 페이지</span>
          )}
        </div>

        {paged.length === 0 ? (
          <div className="px-6 py-6 text-center text-sm text-slate-400">상품 없음</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {paged.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate leading-snug">
                    {p.name}
                  </div>
                  {p.t14 && p.t14.revenue > 0 && (
                    <div className="text-xs text-slate-400 tabular-nums mt-0.5">
                      14일 매출 {formatKRW(p.t14.revenue)}원
                    </div>
                  )}
                </div>
                {p.adTier ? (
                  <span className={cn('shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold', style.adBadge)}>
                    광고중 {p.adTier}
                  </span>
                ) : (
                  <Link
                    href="/ads"
                    className="shrink-0 px-3 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                  >
                    광고 등록
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 text-sm font-medium text-slate-600 disabled:opacity-30 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft size={16} /> 이전
            </button>
            <span className="text-xs text-slate-400">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, products.length)} / {products.length}개</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 text-sm font-medium text-slate-600 disabled:opacity-30 hover:text-slate-900 transition-colors"
            >
              다음 <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* AI 전략 제안 */}
      {sortedRules.length > 0 && (
        <div className="bg-white border-t border-slate-100">
          <div className="px-6 py-3 border-b border-slate-50 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">AI 전략 제안 {sortedRules.length}건</span>
            {urgents > 0 && (
              <div className="flex items-center gap-1 text-xs font-bold text-red-600">
                <AlertTriangle size={12} /> 긴급 {urgents}건
              </div>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {sortedRules.map((r, i) => (
              <div key={i} className="flex items-start gap-3 px-6 py-3">
                {r.priority && (
                  <span className={cn(
                    'shrink-0 px-2 py-0.5 rounded text-xs font-bold mt-0.5',
                    r.priority === 'urgent' ? 'bg-red-500 text-white' :
                    r.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                    r.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-700',
                  )}>
                    {r.priority === 'urgent' ? '긴급' : r.priority === 'high' ? '높음' : r.priority === 'medium' ? '보통' : '낮음'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800">{r.name || r.rule}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{r.action}</div>
                </div>
                {r.roas !== undefined && (
                  <span className={cn('shrink-0 text-sm font-bold tabular-nums', roasColor(r.roas, roasT))}>
                    ROAS {r.roas}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function GradeCards({ budgetAllocation, rules }: Props) {
  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () => apiClient.get<{
      roas: { thresholds: { excellent: number; warning: number; poor: number } };
      gradeStrategy: Record<string, { title: string; subtitle: string; pills: string[]; budgetTarget: number }>;
    }>('/api/ads/config'),
  });

  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };
  const totalSpend = (rules ?? []).reduce((s, r) => s + (r.spend || 0), 0);

  if (!adsConfig?.gradeStrategy) {
    return <div className="text-sm text-slate-400">설정 로딩 중...</div>;
  }

  const gradeData = ['A', 'B', 'C'].map((grade) => {
    const strategy = adsConfig.gradeStrategy[grade];
    const style = GRADE_STYLES[grade];
    const gradeRules = (rules ?? []).filter((r) => r.grade === grade);
    const gradeSpend = gradeRules.reduce((s, r) => s + (r.spend || 0), 0);
    const pct = budgetAllocation?.find((b) => b.grade === grade)?.currentPercent
      ?? (totalSpend > 0 ? Math.round((gradeSpend / totalSpend) * 100) : 0);
    return { grade, style, ...strategy, pct, rules: gradeRules };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-violet-500" />
        <h2 className="text-lg font-bold text-slate-900">ABC 등급별 광고 전략</h2>
      </div>

      <div className="space-y-6">
        {gradeData.map((g) => (
          <GradeProductPanel
            key={g.grade}
            grade={g.grade}
            style={g.style}
            title={g.title}
            subtitle={g.subtitle}
            pills={g.pills}
            target={g.budgetTarget}
            pct={g.pct}
            rules={g.rules}
            roasT={roasT}
          />
        ))}
      </div>
    </div>
  );
}
