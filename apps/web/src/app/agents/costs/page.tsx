'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Cpu, Bot, Activity, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentApi } from '@/lib/agent-api';
import { formatTokens, formatCost } from '@/lib/agent-utils';
import { ROLE_LABELS } from '@/lib/agent-types';
import type { Agent, AgentRuntimeState } from '@/lib/agent-types';

type Period = '이번 달' | '최근 7일' | '최근 30일' | '전체';
const PERIODS: Period[] = ['이번 달', '최근 7일', '최근 30일', '전체'];

interface AgentWithState {
  agent: Agent;
  state: AgentRuntimeState | null;
}

function periodStartMs(period: Period): number {
  const now = Date.now();
  if (period === '전체') return 0;
  if (period === '최근 7일') return now - 7 * 86400_000;
  if (period === '최근 30일') return now - 30 * 86400_000;
  // 이번 달: first day of current month
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export default function CostsPage() {
  const [period, setPeriod] = useState<Period>('전체');
  const [rows, setRows] = useState<AgentWithState[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const agents = await agentApi.list();
      const states = await Promise.all(
        agents.map((a) => agentApi.getRuntimeState(a.id).catch(() => null)),
      );
      setRows(agents.map((a, i) => ({ agent: a, state: states[i] })));
    } catch (err) {
      console.error('Failed to fetch costs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Runtime state is cumulative (all-time). For sub-period filters, we note this.
  // Rows are always based on cumulative totals; period selector is a UX affordance.
  const sorted = [...rows].sort(
    (a, b) => (b.state?.totalCostCents ?? 0) - (a.state?.totalCostCents ?? 0),
  );

  const totalCost = rows.reduce((s, r) => s + (r.state?.totalCostCents ?? 0), 0);
  const totalInput = rows.reduce((s, r) => s + (r.state?.totalInputTokens ?? 0), 0);
  const totalOutput = rows.reduce((s, r) => s + (r.state?.totalOutputTokens ?? 0), 0);
  const totalTokens = totalInput + totalOutput;
  const agentCount = rows.length;

  const isCumulative = period !== '전체';

  if (loading) {
    return (
      <div className="p-8 max-w-5xl">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-24 bg-gray-100 rounded" />
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 flex-1 bg-gray-100 rounded-lg" />)}
          </div>
          <div className="h-48 bg-gray-100 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-end mb-6">
        <button
          onClick={fetchAll}
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
            onClick={() => setPeriod(p)}
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

      {isCumulative && (
        <p className="text-xs text-gray-400 mb-4">
          현재 표시된 수치는 전체 누적 데이터입니다. 기간 필터링은 추후 지원 예정입니다.
        </p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="총 비용"
          value={formatCost(totalCost)}
          iconBg="bg-green-50 text-green-600"
        />
        <SummaryCard
          icon={<Cpu className="w-4 h-4" />}
          label="총 토큰"
          value={formatTokens(totalTokens)}
          sub={`입력 ${formatTokens(totalInput)} · 출력 ${formatTokens(totalOutput)}`}
          iconBg="bg-blue-50 text-blue-600"
        />
        <SummaryCard
          icon={<Bot className="w-4 h-4" />}
          label="에이전트 수"
          value={String(agentCount)}
          iconBg="bg-gray-100 text-gray-600"
        />
      </div>

      {/* Breakdown table */}
      {sorted.length === 0 ? (
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
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">역할</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-xs">입력 토큰</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-xs">출력 토큰</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-xs">비용</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-xs">마지막 실행</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ agent, state }, idx) => {
                const cost = state?.totalCostCents ?? 0;
                const inp = state?.totalInputTokens ?? 0;
                const out = state?.totalOutputTokens ?? 0;
                const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
                const isLast = idx === sorted.length - 1;
                return (
                  <tr
                    key={agent.id}
                    className={cn(
                      'hover:bg-gray-50 transition-colors',
                      !isLast && 'border-b border-gray-100',
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0 text-xs font-semibold text-gray-600">
                          {agent.icon ?? agent.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{agent.name}</p>
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
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {ROLE_LABELS[agent.role] ?? agent.role}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                      {formatTokens(inp)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                      {formatTokens(out)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-medium text-gray-900">
                      {formatCost(cost)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">
                      {agent.lastHeartbeatAt
                        ? new Date(agent.lastHeartbeatAt).toLocaleDateString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
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
