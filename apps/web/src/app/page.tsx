'use client'

import React, { useState, useMemo, useEffect } from 'react';
import { Zap } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DashboardSummary as DashboardData, DashboardTrendItem as TrendPoint } from '@kiditem/shared';
import KpiCards from '@/components/dashboard/KpiCards';
import HealthSummaryCard from '@/components/dashboard/HealthSummaryCard';
import type { HealthSummary } from '@/components/dashboard/HealthSummaryCard';
import TrendChart from '@/components/dashboard/TrendChart';
import type { TrendRange } from '@/components/dashboard/TrendChart';
import ActionPanels from '@/components/dashboard/ActionPanels';
import type { HumanTask, AiAction } from '@/components/dashboard/ActionPanels';
import GradeCards from '@/components/dashboard/GradeCards';
import TopProductsTable from '@/components/dashboard/TopProductsTable';

function generateTasksAndActions(d: DashboardData): { tasks: HumanTask[]; actions: AiAction[] } {
  const tasks: HumanTask[] = [];
  const actions: AiAction[] = [];
  const w = d.warnings;

  if (w.highAdProducts > 0) {
    tasks.push({
      id: 'h-ad-bid', label: `광고비 초과 ${w.highAdProducts}개 — 입찰가 하향 조정`,
      detail: '쿠팡 광고센터에서 해당 상품 입찰가를 낮추거나 일예산 축소',
      where: '쿠팡 광고센터', priority: 'urgent',
    });
  }
  if (w.minusProducts > 0) {
    tasks.push({
      id: 'h-minus-ad-stop', label: `적자 상품 ${w.minusProducts}개 — 광고 중단 처리`,
      detail: '쿠팡 광고센터에서 적자 상품 캠페인 OFF 처리',
      where: '쿠팡 광고센터', priority: 'urgent', href: '/cleanup',
    });
    tasks.push({
      id: 'h-minus-price', label: `적자 상품 ${w.minusProducts}개 — 판매가 인상 검토`,
      detail: '경쟁사 가격 확인 후 마진 확보 가능한 상품 가격 조정',
      where: '쿠팡 윙', priority: 'high', href: '/cleanup',
    });
  }
  if (w.needReorder > 0) {
    tasks.push({
      id: 'h-reorder', label: `${w.needReorder}개 상품 — 매입처에 발주`,
      detail: '안전재고 이하 상품을 매입처에 발주서 전송',
      where: '매입처/1688', priority: 'high',
    });
  }
  if (d.summary.adRate > 12) {
    tasks.push({
      id: 'h-ad-rate', label: `전체 광고비율 ${d.summary.adRate}% — 비효율 캠페인 정리`,
      detail: 'ROAS 200% 미만 캠페인을 쿠팡 광고센터에서 OFF 또는 입찰가 50% 하향',
      where: '쿠팡 광고센터', priority: 'high',
    });
  }
  if (w.lowProfitProducts > 0) {
    tasks.push({
      id: 'h-low-profit', label: `저이익 ${w.lowProfitProducts}개 — 소싱처/수수료 재검토`,
      detail: '원가 절감 가능한 소싱처 확인, 카테고리 수수료율 점검',
      where: '소싱처/쿠팡 윙', priority: 'medium', href: '/cleanup',
    });
  }

  actions.push({
    id: 'recalc-grade', label: 'ABC 등급 재계산', desc: '최신 매출/마진/판매속도 기반 등급 재산정',
    priority: 'medium',
    apiCall: { url: '/api/products/calculate-grades', method: 'POST' },
  });
  if (w.minusProducts > 0 || w.lowProfitProducts > 0) {
    actions.push({
      id: 'view-cleanup', label: '정리대상 상품 분석 보기', desc: `적자 ${w.minusProducts}개 + 저이익 ${w.lowProfitProducts}개 원인 분석`,
      priority: 'high', href: '/cleanup',
    });
  }
  if (w.highAdProducts > 0) {
    actions.push({
      id: 'view-ad-strategy', label: '광고 전략 리포트 확인', desc: 'AI 추천 입찰가/일예산/액션 플랜 확인',
      priority: 'high', href: '/profit-loss',
    });
  }
  actions.push({
    id: 'view-profit', label: '손익 분석 리포트', desc: '상품별 손익 현황 상세 확인',
    priority: 'medium', href: '/profit-loss',
  });

  return { tasks, actions };
}

export default function HomePage() {
  const queryClient = useQueryClient();
  const [trendRange, setTrendRange] = useState<TrendRange>('30d');
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>({});
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = JSON.parse(localStorage.getItem('dashboard-checked-tasks') || '{}');
      if (saved.date === new Date().toDateString()) {
        const map: Record<string, boolean> = {};
        ((saved.ids || []) as string[]).forEach(id => { map[id] = true; });
        return map;
      }
      return {};
    } catch { return {}; }
  });

  // Persist checked tasks to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ids = Object.keys(checkedTasks).filter(k => checkedTasks[k]);
      localStorage.setItem('dashboard-checked-tasks', JSON.stringify({ date: new Date().toDateString(), ids }));
    }
  }, [checkedTasks]);

  // Dashboard summary query
  const { data, isLoading: loading } = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: () => apiClient.get<DashboardData>('/api/dashboard'),
  });

  // Trend query
  const { data: trendData = [], isLoading: trendLoading } = useQuery({
    queryKey: queryKeys.dashboard.trend(trendRange),
    queryFn: () => apiClient.get<TrendPoint[]>(`/api/dashboard/trend?range=${trendRange}`),
  });

  // Health summary query
  const { data: healthSummary = null, isLoading: healthLoading } = useQuery({
    queryKey: queryKeys.dashboard.health(),
    queryFn: () => apiClient.get<HealthSummary>('/api/rules/summary'),
  });

  // Derived state from dashboard data
  const { tasks: humanTasks, actions: aiActions } = useMemo(
    () => data ? generateTasksAndActions(data) : { tasks: [] as HumanTask[], actions: [] as AiAction[] },
    [data],
  );

  // Evaluate mutation
  const evaluateMutation = useMutation({
    mutationFn: () => apiClient.post('/api/rules/evaluate'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.health() });
    },
  });
  const evaluating = evaluateMutation.isPending;
  const handleEvaluate = () => evaluateMutation.mutate();

  const toggleTask = (id: string) => {
    setCheckedTasks(prev => {
      const next = { ...prev };
      next[id] = !prev[id];
      return next;
    });
  };

  const markActionCompleted = (id: string) => {
    setCompletedActions(prev => ({ ...prev, [id]: true }));
  };

  const executeAction = async (action: AiAction) => {
    if (action.href && !action.apiCall) {
      markActionCompleted(action.id);
      return;
    }
    if (action.apiCall) {
      if (action.apiCall.url.includes('calculate-grades')) {
        if (!confirm('전체 상품의 ABC 등급을 재계산합니다. 계속하시겠습니까?')) return;
      }
      setProcessingAction(action.id);
      try {
        const json = await apiClient.post<{ success?: boolean; updatedCount?: number; error?: string }>(
          action.apiCall.url,
          action.apiCall.body,
        );
        if (json.success || json.updatedCount !== undefined) {
          markActionCompleted(action.id);
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
        } else if (json.error) {
          toast.error(`실행 실패: ${json.error}`);
        }
      } catch (e) {
        toast.error(isApiError(e) ? e.detail : '알 수 없는 오류가 발생했습니다.');
      } finally {
        setProcessingAction(null);
      }
    }
  };

  if (loading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">대시보드 데이터를 불러오는데 실패했습니다.</div>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">운영 대시보드</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-gray-400">{s.totalProducts}개 상품</span>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs text-gray-400">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      <KpiCards summary={s} />

      <HealthSummaryCard
        healthSummary={healthSummary}
        healthLoading={healthLoading}
        evaluating={evaluating}
        onEvaluate={handleEvaluate}
      />

      <TrendChart
        trendData={trendData}
        monthlyTrend={data.monthlyTrend ?? []}
        trendRange={trendRange}
        trendLoading={trendLoading}
        onRangeChange={setTrendRange}
      />

      <ActionPanels
        humanTasks={humanTasks}
        aiActions={aiActions}
        alerts={data.alerts}
        checkedTasks={checkedTasks}
        completedActions={completedActions}
        processingAction={processingAction}
        onToggleTask={toggleTask}
        onExecuteAction={executeAction}
        onMarkActionCompleted={markActionCompleted}
      />

      <GradeCards
        gradeCount={data.gradeCount}
        warnings={data.warnings}
        totalProducts={s.totalProducts}
      />

      <TopProductsTable products={data.topProducts} />
    </div>
  );
}
