'use client';

import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { ArrowLeft, Coins } from 'lucide-react';
import { AI_USAGE_AGENT_LABELS, AiUsageAgentKeySchema } from '@kiditem/shared/ai';
import { formatNumber } from '@/lib/utils';
import { KRW_RATE_NOTE, formatKrwApprox, formatUsd, monthToDate, useAiUsage } from '../../_shared/ai-usage';

/**
 * 에이전트 홈. 지금은 그 에이전트가 쓴 AI 비용(이번 달)을 보여 준다 — 사장님 2026-09-18
 * "일단 인공지능 토큰비용 나오게". 비용은 서버가 호출마다 남긴 토큰과 추정 단가로 센다.
 */
export default function AgentHomePage() {
  const params = useParams<{ agent: string }>();
  const agent = AiUsageAgentKeySchema.safeParse(params.agent);
  if (!agent.success) notFound();
  const label = AI_USAGE_AGENT_LABELS[agent.data];
  const range = monthToDate();
  const usage = useAiUsage({ ...range, agent: agent.data });
  const totals = usage.data?.totals;

  const tiles = [
    { key: 'cost', label: '추정 비용', value: totals ? formatUsd(totals.costMicroUsd) : null, note: totals ? formatKrwApprox(totals.costMicroUsd) : null, title: KRW_RATE_NOTE },
    { key: 'calls', label: 'AI 호출', value: totals ? `${formatNumber(totals.calls)}회` : null, note: null, title: undefined },
    { key: 'input', label: '입력 토큰', value: totals ? formatNumber(totals.inputTokens) : null, note: null, title: undefined },
    { key: 'output', label: '출력 토큰', value: totals ? formatNumber(totals.outputTokens) : null, note: null, title: undefined },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="agent-home">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-violet-700">
            <ArrowLeft size={12} aria-hidden /> 대시보드
          </Link>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{label} 에이전트</h1>
        </div>
        <p className="text-xs text-slate-500">{range.from} ~ {range.to}</p>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="AI 비용">
        <header className="flex h-10 items-center justify-between border-b border-slate-100 px-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Coins size={14} className="text-amber-500" aria-hidden />
            AI 비용 · 이번 달
          </h2>
          {usage.data?.recordingSince ? (
            <span className="text-[11px] text-slate-400">{usage.data.recordingSince.slice(0, 10)}부터 기록</span>
          ) : null}
        </header>
        {usage.isError ? (
          <p className="px-4 py-6 text-sm text-red-600">AI 비용을 읽지 못했습니다. <button type="button" className="underline" onClick={() => void usage.refetch()}>다시 시도</button></p>
        ) : (
          <dl className="grid grid-cols-2 gap-px bg-slate-100 md:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.key} className="bg-white px-4 py-3" title={tile.title} data-testid={`agent-usage-${tile.key}`}>
                <dt className="text-[11px] font-semibold text-slate-500">{tile.label}</dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{tile.value ?? <span className="text-slate-300">—</span>}</dd>
                {tile.note ? <dd className="text-xs text-slate-500">{tile.note}</dd> : null}
              </div>
            ))}
          </dl>
        )}
        {usage.data && usage.data.recordingSince === null ? (
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            아직 기록이 없습니다. 이 에이전트가 AI(Gemini)를 쓰면 이때부터 쌓입니다.
          </p>
        ) : null}
        {totals && totals.unpricedCalls > 0 ? (
          <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            단가가 등록되지 않은 모델 호출 {formatNumber(totals.unpricedCalls)}회는 토큰만 세고 비용에 넣지 않았습니다.
          </p>
        ) : null}
      </section>

      {usage.data && usage.data.models.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="모델별 AI 사용">
          <header className="flex h-10 items-center border-b border-slate-100 px-4">
            <h2 className="text-sm font-semibold text-slate-800">모델별</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400">
                  <th className="px-4 py-2 font-semibold">모델</th>
                  <th className="px-2 py-2 text-right font-semibold">호출</th>
                  <th className="px-2 py-2 text-right font-semibold">입력 토큰</th>
                  <th className="px-2 py-2 text-right font-semibold">출력 토큰</th>
                  <th className="px-4 py-2 text-right font-semibold">추정 비용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {usage.data.models.map((row) => (
                  <tr key={row.model}>
                    <td className="px-4 py-2 font-mono text-xs text-slate-700">{row.model}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatNumber(row.calls)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatNumber(row.inputTokens)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatNumber(row.outputTokens)}</td>
                    <td className="px-4 py-2 text-right tabular-nums" title={row.priced ? KRW_RATE_NOTE : undefined}>
                      {row.priced ? formatUsd(row.costMicroUsd) : <span className="text-amber-700">단가 미등록</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
