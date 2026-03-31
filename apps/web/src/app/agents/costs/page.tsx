'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Cpu, Bot, Activity, RefreshCw, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { agentApi } from '@/lib/agent-api';
import { isApiError } from '@/lib/api-error';
import { formatTokens, formatCost } from '@/lib/agent-utils';
import type { Agent, CostAnalytics } from '@/lib/agent-types';
import CostTrendChart from './CostTrendChart';
import BudgetGauge from './BudgetGauge';

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
  // 이번 달
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return { from, to };
}

export default function CostsPage() {
  const [period, setPeriod] = useState<Period>('전체');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [analytics, setAnalytics] = useState<CostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const range = periodRange(p);
      const [agentList, costData] = await Promise.all([
        agentApi.list(),
        agentApi.getCostAnalytics({ from: range.from, to: range.to }),
      ]);
      setAgents(agentList);
      setAnalytics(costData);
      setError(null);
    } catch (err) {
      setError(isApiError(err) ? err.detail : '비용 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll(period);
  }, [fetchAll, period]);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
  };

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
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-end mb-6">
        <button
          onClick={() => fetchAll(period)}
          className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors"
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
            onClick={() => handlePeriodChange(p)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg border transition-colors',
              period === p
                ? 'bg-gray-900 text-white border-gray-900'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="총 비용"
          value={formatCost(summary.totalCostCents)}
          iconBg="bg-green-50 text-green-600"
        />
        <SummaryCard
          icon={<Cpu className="w-4 h-4" />}
          label="총 토큰"
          value={formatTokens(totalTokens)}
          sub={`입력 ${formatTokens(summary.totalInputTokens)} · 출력 ${formatTokens(summary.totalOutputTokens)}`}
          iconBg="bg-blue-50 text-blue-600"
        />
        <SummaryCard
          icon={<Bot className="w-4 h-4" />}
          label="에이전트 수"
          value={String(analytics?.byAgent.length ?? 0)}
          iconBg="bg-gray-100 text-gray-600"
        />
        <SummaryCard
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
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 border border-gray-200 rounded-lg">
          <Activity className="w-8 h-8 mb-2" />
          <p className="text-sm">비용 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">에이전트</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-xs">입력 토큰</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-xs">출력 토큰</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-xs">실행 횟수</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-xs">비용</th>
              </tr>
            </thead>
            <tbody>
              {analytics!.byAgent.map((row, idx) => {
                const pct =
                  summary.totalCostCents > 0
                    ? (row.totalCostCents / summary.totalCostCents) * 100
                    : 0;
                const isLast = idx === analytics!.byAgent.length - 1;
                return (
                  <tr
                    key={row.agentId}
                    className={cn(
                      'hover:bg-gray-50 transition-colors',
                      !isLast && 'border-b border-gray-100',
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0 text-xs font-semibold text-gray-600">
                          {row.agentName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{row.agentName}</p>
                          {pct > 0 && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-400 rounded-full"
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-400">{pct.toFixed(1)}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                      {formatTokens(row.totalInputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                      {formatTokens(row.totalOutputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                      {row.runCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-medium text-gray-900">
                      {formatCost(row.totalCostCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  iconBg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  iconBg: string;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', iconBg)}>
          {icon}
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
