'use client';

import { cn } from '@/lib/utils';
import { formatTokens, formatCost } from '../../lib/agent-utils';

interface AgentCostRow {
  agentId: string;
  agentName: string;
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  runCount: number;
}

interface CostBreakdownTableProps {
  byAgent: AgentCostRow[];
  totalCostCents: number;
}

export function CostBreakdownTable({ byAgent, totalCostCents }: CostBreakdownTableProps) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-2.5 text-left font-medium text-slate-500 text-xs">에이전트</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-500 text-xs">입력 토큰</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-500 text-xs">출력 토큰</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-500 text-xs">실행 횟수</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-500 text-xs">비용</th>
          </tr>
        </thead>
        <tbody>
          {byAgent.map((row, idx) => {
            const pct = totalCostCents > 0 ? (row.totalCostCents / totalCostCents) * 100 : 0;
            const isLast = idx === byAgent.length - 1;
            return (
              <tr
                key={row.agentId}
                className={cn('hover:bg-slate-50 transition-colors', !isLast && 'border-b border-slate-100')}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center shrink-0 text-xs font-semibold text-slate-600">
                      {row.agentName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{row.agentName}</p>
                      {pct > 0 && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-400 rounded-full"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400">{pct.toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                  {formatTokens(row.totalInputTokens)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                  {formatTokens(row.totalOutputTokens)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                  {row.runCount}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs font-medium text-slate-900">
                  {formatCost(row.totalCostCents)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
