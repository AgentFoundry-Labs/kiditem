'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { PlanSummary } from './components/PlanSummary';
import { GradeCards } from './components/GradeCards';
import { RecommendCards } from './components/RecommendCards';
import { TrendsComparison } from './components/TrendsComparison';

export default function AdsStrategyPage() {
  const queryClient = useQueryClient();

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: queryKeys.ads.rules(),
    queryFn: () => apiClient.get<{
      summary: Record<string, number>;
      recommendations: Array<{ rule: string; grade?: string; priority?: string; action?: string }>;
    }>('/api/ads/strategy/rules'),
  });

  const { data: planData } = useQuery({
    queryKey: queryKeys.ads.plan(),
    queryFn: () => apiClient.get<{
      generatedAt: string;
      totalProducts: number;
      summary: { scaleUp: number; optimize: number; reduce: number; stop: number; newStart: number };
      budgetAllocation: Array<{ grade: string; currentPercent: number; targetPercent: number; gap: number }>;
      keyMetrics: { totalAdSpend: number; totalAdRevenue: number; overallRoas: number };
    }>('/api/ads/strategy/plan'),
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
    queryKey: queryKeys.ads.trends(14),
    queryFn: () => apiClient.get<{
      daily: Array<{ date: string; spend: number; revenue: number; roas: number }>;
      comparison: Record<string, { before: number; after: number; change: number }>;
      budgetAllocation: Array<{ grade: string; spend: number; revenue: number; pct: number; target: number; roas: number }>;
    }>('/api/ads/campaigns/trends?days=14'),
  });

  const runAnalysis = useMutation({
    mutationFn: () => apiClient.post('/api/ad-agent/run', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.rules() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.plan() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.recommend() });
    },
  });

  if (rulesLoading) return <PageSkeleton variant="table" />;

  const isEmpty = !rulesData?.recommendations?.length && !planData && !recommendData?.cards?.length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">ABC 전략</h1>

      {isEmpty ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="text-slate-400 mb-3">
            <Sparkles size={32} className="mx-auto mb-2 text-violet-400" />
            <p className="text-sm">에이전트 분석 결과가 없습니다.</p>
            <p className="text-xs text-slate-300 mt-1">AI가 광고 데이터를 분석하여 전략을 제안합니다.</p>
          </div>
          <button
            onClick={() => runAnalysis.mutate()}
            disabled={runAnalysis.isPending}
            className="mt-3 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {runAnalysis.isPending ? '분석 중...' : 'AI 분석 실행'}
          </button>
        </div>
      ) : (
        <>
          {/* Plan Summary */}
          {planData && <PlanSummary plan={planData} />}

          {/* ABC Grade Cards */}
          <GradeCards
            budgetAllocation={planData?.budgetAllocation}
            rules={rulesData?.recommendations}
          />

          {/* AI Recommend Cards */}
          {recommendData?.cards && <RecommendCards cards={recommendData.cards} />}

          {/* Trends + Budget Pie */}
          {trendsData?.daily && trendsData.comparison && trendsData.budgetAllocation && (
            <TrendsComparison
              daily={trendsData.daily}
              comparison={trendsData.comparison}
              budgetAllocation={trendsData.budgetAllocation}
            />
          )}
        </>
      )}
    </div>
  );
}
