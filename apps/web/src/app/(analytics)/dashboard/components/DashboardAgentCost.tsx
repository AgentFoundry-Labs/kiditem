import Link from 'next/link';
import { Coins } from 'lucide-react';
import { AI_USAGE_AGENT_KEYS, AI_USAGE_AGENT_LABELS } from '@kiditem/shared/ai';
import { KRW_RATE_NOTE, formatKrwApprox, formatUsd, monthToDate, useAiUsage } from '../../_shared/ai-usage';
import { cn } from '@/lib/utils';
import { DashboardCardHeader } from './DashboardCardHeader';

/**
 * 에이전트 비용 — 이번 달 AI(Gemini) 추정 비용을 에이전트마다, 사이드바 순서로.
 * 줄을 누르면 그 에이전트 홈으로 간다. 기록은 계량을 시작한 날부터다.
 */
export function DashboardAgentCost({ className }: { className?: string }) {
  const usage = useAiUsage(monthToDate());
  const byAgent = new Map((usage.data?.agents ?? []).map((row) => [row.agentKey, row]));
  const unattributed = byAgent.get(null);
  const total = usage.data?.totals;

  return (
    <section aria-label="에이전트 비용" className={cn('flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white', className)} data-testid="dashboard-agent-cost">
      <DashboardCardHeader icon={Coins} tone="amber" title="에이전트 비용 · 이번 달">
        <span className="text-sm font-bold tabular-nums text-slate-900" title={total ? `${formatKrwApprox(total.costMicroUsd)} · ${KRW_RATE_NOTE}` : undefined}>
          {total ? formatUsd(total.costMicroUsd) : '—'}
        </span>
      </DashboardCardHeader>
      {usage.isError ? (
        <p className="px-4 py-3 text-xs text-red-600">AI 비용을 읽지 못했습니다.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-px bg-slate-100">
          {AI_USAGE_AGENT_KEYS.map((key) => {
            const row = byAgent.get(key);
            return (
              <li key={key} className="bg-white">
                <Link href={`/agents/${key}`} className="flex h-8 items-center justify-between gap-2 px-4 text-xs transition-colors hover:bg-slate-50">
                  <span className="font-semibold text-slate-700">{AI_USAGE_AGENT_LABELS[key]}</span>
                  <span className="tabular-nums text-slate-600">{row ? formatUsd(row.costMicroUsd) : usage.data ? '$0.00' : '—'}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex h-8 items-center justify-between gap-2 bg-white px-4 text-xs" title="어느 에이전트의 요청인지 모르는 호출">
            <span className="text-slate-500">기타</span>
            <span className="tabular-nums text-slate-500">{unattributed ? formatUsd(unattributed.costMicroUsd) : usage.data ? '$0.00' : '—'}</span>
          </li>
        </ul>
      )}
      {usage.data && usage.data.recordingSince === null ? (
        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">아직 기록 없음 — AI를 쓰면 이때부터 쌓입니다.</p>
      ) : null}
    </section>
  );
}
