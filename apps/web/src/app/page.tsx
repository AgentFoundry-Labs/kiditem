'use client'

import React, { useState, useMemo, useEffect } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DashboardSummary as DashboardData, DashboardTrendItem as TrendPoint } from '@kiditem/shared';
import KpiCards from './components/dashboard/KpiCards';
import HealthSummaryCard from './components/dashboard/HealthSummaryCard';
import type { HealthSummary } from './components/dashboard/HealthSummaryCard';
import TrendChart from './components/dashboard/TrendChart';
import type { TrendRange } from './components/dashboard/TrendChart';
import ActionPanels from './components/dashboard/ActionPanels';
import type { HumanTask, AiAction } from './components/dashboard/ActionPanels';
import GradeCards from './components/dashboard/GradeCards';
import TopProductsTable from './components/dashboard/TopProductsTable';
import DashboardHeader from './components/dashboard/DashboardHeader';
import { generateTasksAndActions } from './components/dashboard/generate-tasks';

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
      <DashboardHeader totalProducts={s.totalProducts} />

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
