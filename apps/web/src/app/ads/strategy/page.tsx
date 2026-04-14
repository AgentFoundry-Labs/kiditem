'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { PlanSummary } from './components/PlanSummary';
import { GradeCards } from './components/GradeCards';
import { RecommendCards } from './components/RecommendCards';
import { TrendsComparison } from './components/TrendsComparison';

type Period = '7d' | '14d' | 'month';

const PERIOD_LABELS: Record<Period, string> = { '7d': '7일', '14d': '14일', 'month': '이번달' };

export default function AdsStrategyPage() {
  const [period, setPeriod] = useState<Period>('14d');

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: queryKeys.ads.rules(period),
    queryFn: () => apiClient.get<{
      summary: Record<string, number>;
      recommendations: Array<{ rule: string; grade?: string; priority?: string; action?: string }>;
      period: Period;
      keyMetrics: {
        totalAdSpend: number;
        totalAdRevenue: number;
        overallRoas: number;
        totalImpressions: number;
        totalClicks: number;
        totalConversions: number;
        ctr: number;
        cvr: number;
        adRatio: number;
      } | null;
      hasSnapshotData: boolean;
    }>(`/api/ads/strategy/rules?period=${period}`),
  });

  const { data: planData } = useQuery({
    queryKey: queryKeys.ads.plan(period),
    queryFn: () => apiClient.get<{
      generatedAt: string;
      totalProducts: number;
      summary: { scaleUp: number; optimize: number; reduce: number; stop: number; newStart: number };
      budgetAllocation: Array<{ grade: string; currentPercent: number; targetPercent: number; gap: number }>;
      keyMetrics: { totalAdSpend: number; totalAdRevenue: number; overallRoas: number };
      snapshotKeyMetrics: {
        totalAdSpend: number;
        totalAdRevenue: number;
        overallRoas: number;
        totalImpressions: number;
        totalClicks: number;
        totalConversions: number;
        ctr: number;
        cvr: number;
        adRatio: number;
      } | null;
      hasSnapshotData: boolean;
    }>(`/api/ads/strategy/plan?period=${period}`),
  });

  const { data: recommendData } = useQuery({
    queryKey: queryKeys.ads.recommend(),
    queryFn: () => apiClient.get<{
      cards: Array<{
        title: string;
        icon: string;
        color: string;
        items: Array<{ text: string; productName?: string; value?: string; priority: string }>;
      }>;
      keyMetrics: { totalAdSpend: number; totalAdRevenue: number; overallRoas: number };
    }>('/api/ads/strategy/recommend'),
  });

  const { data: trendsData } = useQuery({
    queryKey: queryKeys.ads.trends(period),
    queryFn: () => apiClient.get<{
      daily: Array<{ date: string; spend: number; revenue: number; roas: number; clicks: number; impressions: number; conversions: number; ctr: number; cvr: number }>;
      comparison: Record<string, { before: number; after: number; change: number }>;
      budgetAllocation: Array<{ grade: string; spend: number; revenue: number; pct: number; target: number; roas: number }>;
    }>(`/api/ads/campaigns/trends?period=${period}`),
  });

  if (rulesLoading) return <PageSkeleton variant="table" />;

  const hasSnapshotData = rulesData?.hasSnapshotData ?? planData?.hasSnapshotData ?? false;
  const keyMetrics = rulesData?.keyMetrics ?? planData?.snapshotKeyMetrics ?? null;
  const hasAgentData = !!(rulesData?.recommendations?.length || recommendData?.cards?.length);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">ABC 전략</h1>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                period === p
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {!hasSnapshotData && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
          <span>
            광고센터 일별 데이터가 없습니다. 익스텐션에서 <strong>coupang_ads_daily</strong> 수집을 실행하면 KPI 지표가 채워집니다.
          </span>
        </div>
      )}

      {!hasAgentData && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-sm text-violet-700">
          에이전트 분석 결과가 없습니다. AI 분석을 실행하면 데이터가 채워집니다.
        </div>
      )}

      {/* KPI 지표 — 수집 데이터 있을 때만 */}
      <PlanSummary
        plan={planData ?? undefined}
        keyMetrics={keyMetrics}
        hasSnapshotData={hasSnapshotData}
        period={period}
      />

      {/* ABC Grade Cards — 항상 표시 */}
      <GradeCards
        budgetAllocation={planData?.budgetAllocation}
        rules={rulesData?.recommendations}
      />

      {/* AI Recommend Cards — 항상 표시 */}
      <RecommendCards cards={recommendData?.cards ?? []} />

      {/* Trends + Budget Pie — 항상 표시 */}
      {trendsData?.daily && trendsData.comparison && trendsData.budgetAllocation && (
        <TrendsComparison
          daily={trendsData.daily}
          comparison={trendsData.comparison}
          budgetAllocation={trendsData.budgetAllocation}
        />
      )}
    </div>
  );
}
