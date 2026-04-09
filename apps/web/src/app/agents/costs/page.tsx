'use client';

import { useState, useMemo } from 'react';
import { DollarSign, Cpu, Bot, Activity, RefreshCw, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { formatTokens, formatCost } from '../lib/agent-utils';
import { useAgents, useAgentCostAnalytics } from '../hooks/useAgents';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import dynamic from 'next/dynamic';

const CostTrendChart = dynamic(() => import('./components/CostTrendChart'), { ssr: false });
import BudgetGauge from './components/BudgetGauge';
import { CostSummaryCard } from './components/CostSummaryCard';
import { CostBreakdownTable } from './components/CostBreakdownTable';

type Period = '이번 달' | '최근 7일' | '최근 30일' | '전체';
const PERIODS: Period[] = ['이번 달', '최근 7일', '최근 30일', '전체'];

function periodRange(period: Period): { from?: string; to?: string } {
  if (period === '전체') return {};
  const now = new Date();
  const to = now.toISOString();
  if (period === '최근 7일') {
    const from = new Date(now.getTime() - 7 * 86400_000).toISOString();
    return { from, to };
  }
  if (period === '최근 30일') {
    const from = new Date(now.getTime() - 30 * 86400_000).toISOString();
    return { from, to };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return { from, to };
}

export default function CostsPage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>('전체');

  const range = useMemo(() => periodRange(period), [period]);
  const costParams = useMemo(() => ({ from: range.from, to: range.to }), [range]);

  const { data: agents = [] } = useAgents();
  const { data: analytics = null, isLoading: loading, error: queryError } = useAgentCostAnalytics(costParams);
  const error = queryError ? '비용 데이터를 불러오는데 실패했습니다.' : null;

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <PageSkeleton variant="dashboard" />
      </div>
    );
  }

  const summary = analytics?.summary ?? {
    totalCostCents: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRuns: 0,
  };
  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;

  return (
    <div className="p-4 sm:p-8">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-end mb-6">
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })}
          className="p-1.5 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg transition-colors"
          title="새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 mb-6">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg border transition-colors',
              period === p
                ? 'bg-slate-900 text-white border-slate-900'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <CostSummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="총 비용"
          value={formatCost(summary.totalCostCents)}
          iconBg="bg-green-50 text-green-600"
        />
        <CostSummaryCard
          icon={<Cpu className="w-4 h-4" />}
          label="총 토큰"
          value={formatTokens(totalTokens)}
          sub={`입력 ${formatTokens(summary.totalInputTokens)} · 출력 ${formatTokens(summary.totalOutputTokens)}`}
          iconBg="bg-purple-50 text-purple-600"
        />
        <CostSummaryCard
          icon={<Bot className="w-4 h-4" />}
          label="에이전트 수"
          value={String(analytics?.byAgent.length ?? 0)}
          iconBg="bg-slate-100 text-slate-600"
        />
        <CostSummaryCard
          icon={<Hash className="w-4 h-4" />}
          label="총 실행 횟수"
          value={String(summary.totalRuns)}
          iconBg="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Cost Trend Chart */}
      <div className="mb-8">
        <CostTrendChart data={analytics?.daily ?? []} />
      </div>

      {/* Budget Gauge */}
      <div className="mb-8">
        <BudgetGauge agents={agents} />
      </div>

      {/* Breakdown table */}
      {(analytics?.byAgent.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 border border-slate-200 rounded-lg">
          <Activity className="w-8 h-8 mb-2" />
          <p className="text-sm">비용 데이터가 없습니다.</p>
        </div>
      ) : (
        <CostBreakdownTable
          byAgent={analytics!.byAgent}
          totalCostCents={summary.totalCostCents}
        />
      )}
    </div>
  );
}
