'use client';

import type { Agent } from '@/lib/agent-types';
import { formatTokens } from '@/lib/agent-utils';
import { cn } from '@/lib/utils';

interface Props {
  agents: Agent[];
}

export default function BudgetGauge({ agents }: Props) {
  const budgeted = agents.filter((a) => (a.monthlyTokenBudget ?? 0) > 0);

  if (budgeted.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <h3 className="text-sm font-medium text-gray-700 mb-3">월간 예산 현황</h3>
        <p className="text-sm text-gray-400 text-center py-4">예산이 설정된 에이전트가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <h3 className="text-sm font-medium text-gray-700 mb-3">월간 예산 현황</h3>
      <div className="space-y-3">
        {budgeted.map((agent) => {
          const used = agent.tokensUsed ?? 0;
          const budget = agent.monthlyTokenBudget ?? 0;
          const pct = budget > 0 ? Math.round((used / budget) * 100) : 0;
          const barColor =
            pct < 50
              ? 'bg-green-400'
              : pct < 80
                ? 'bg-yellow-400'
                : pct < 100
                  ? 'bg-orange-400'
                  : 'bg-red-500';

          return (
            <div key={agent.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-800">{agent.name}</span>
                <span className="text-xs text-gray-500">
                  {formatTokens(used)} / {formatTokens(budget)} ({pct}%)
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', barColor)}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
