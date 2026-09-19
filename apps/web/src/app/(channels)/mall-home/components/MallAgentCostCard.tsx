'use client';

import { Coins } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import {
  KRW_RATE_NOTE,
  formatKrwApprox,
  formatUsd,
  monthToDate,
  useAiUsage,
} from '../../../(analytics)/_shared/ai-usage';

/**
 * 쇼핑몰 에이전트가 이번 달 쓴 AI 비용 — 에이전트 홈에 있던 것을 쇼핑몰 홈으로 옮겼다(사장님 2026-09-19 "에이전트
 * 홈 이거 없애고 쇼핑몰 홈에다가 에이전트 비용"). 숫자는 서버가 호출마다 남긴 토큰과 추정 단가로 센 AI 사용 요약을
 * 읽기만 한다.
 */
export function MallAgentCostCard() {
  const range = monthToDate();
  const usage = useAiUsage({ ...range, agent: 'mall' });
  const totals = usage.data?.totals;
  const figures = [
    {
      key: 'cost',
      label: '추정 비용',
      value: totals ? formatUsd(totals.costMicroUsd) : null,
      note: totals ? formatKrwApprox(totals.costMicroUsd) : null,
      title: KRW_RATE_NOTE,
    },
    { key: 'calls', label: 'AI 호출', value: totals ? `${formatNumber(totals.calls)}회` : null, note: null, title: undefined },
    { key: 'input', label: '입력 토큰', value: totals ? formatNumber(totals.inputTokens) : null, note: null, title: undefined },
    { key: 'output', label: '출력 토큰', value: totals ? formatNumber(totals.outputTokens) : null, note: null, title: undefined },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="AI 비용">
      <header className="flex h-10 items-center justify-between border-b border-slate-100 px-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Coins size={14} className="text-amber-500" aria-hidden />
          AI 비용 · 이번 달
        </h2>
        <span className="text-[11px] text-slate-400">{range.from} ~ {range.to}</span>
      </header>
      {usage.isError ? (
        <p className="px-4 py-4 text-sm text-red-600">
          AI 비용을 읽지 못했습니다.{' '}
          <button type="button" className="underline" onClick={() => void usage.refetch()}>다시 시도</button>
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-px bg-slate-100 md:grid-cols-4">
          {figures.map((figure) => (
            <div key={figure.key} className="bg-white px-4 py-3" title={figure.title}>
              <dt className="text-[11px] font-semibold text-slate-500">{figure.label}</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                {figure.value ?? <span className="text-slate-300">—</span>}
              </dd>
              {figure.note ? <dd className="text-xs text-slate-500">{figure.note}</dd> : null}
            </div>
          ))}
        </dl>
      )}
      {usage.data && usage.data.recordingSince === null ? (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          아직 기록이 없습니다. 쇼핑몰 에이전트가 AI 를 쓰면 이때부터 쌓입니다.
        </p>
      ) : null}
      {totals && totals.unpricedCalls > 0 ? (
        <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          단가가 등록되지 않은 모델 호출 {formatNumber(totals.unpricedCalls)}회는 토큰만 세고 비용에 넣지 않았습니다.
        </p>
      ) : null}
    </section>
  );
}
