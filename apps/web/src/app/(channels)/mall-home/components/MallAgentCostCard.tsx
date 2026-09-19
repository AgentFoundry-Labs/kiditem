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
 * 쇼핑몰 에이전트가 이번 달 쓴 AI 비용 — 쇼핑몰 알림판 위, 확인 필요 · 열린 몰 알림 줄에 작게 선다(사장님 2026-09-19
 * "AI 비용 저거를 쇼핑몰 알림 위에다가 작게"). 숫자는 서버가 호출마다 남긴 토큰과 추정 단가로 센 AI 사용 요약을
 * 읽기만 한다. 호출 · 토큰은 한 줄로 줄여 적는다.
 */
export function MallAgentCostCard() {
  const range = monthToDate();
  const usage = useAiUsage({ ...range, agent: 'mall' });
  const totals = usage.data?.totals;
  const caption = usage.isError
    ? 'AI 비용을 읽지 못했습니다.'
    : totals
      ? `${formatKrwApprox(totals.costMicroUsd)} · 호출 ${formatNumber(totals.calls)}회 · 토큰 ${formatNumber(totals.inputTokens + totals.outputTokens)}`
      : `${range.from} ~ ${range.to}`;
  const unpriced = totals && totals.unpricedCalls > 0
    ? `단가가 등록되지 않은 모델 호출 ${formatNumber(totals.unpricedCalls)}회는 토큰만 세고 비용에 넣지 않았습니다.`
    : null;
  return (
    <section
      aria-label="AI 비용"
      title={[`${range.from} ~ ${range.to}`, KRW_RATE_NOTE, unpriced].filter(Boolean).join('\n')}
      className="card rounded-2xl p-4"
    >
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <Coins size={14} className="text-amber-500" aria-hidden />
        AI 비용 · 이번 달
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {totals ? formatUsd(totals.costMicroUsd) : <span className="text-slate-300">—</span>}
      </div>
      <p className={usage.isError ? 'mt-1 truncate text-xs text-red-600' : 'mt-1 truncate text-xs text-slate-400'}>
        {caption}
      </p>
    </section>
  );
}
