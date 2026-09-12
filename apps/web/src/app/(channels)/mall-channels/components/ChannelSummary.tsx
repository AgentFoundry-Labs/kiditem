'use client';

import { Boxes, Plug } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  CAPABILITY_KEYS,
  type CapabilityKey,
  type CapabilityTotals,
} from '../../_shared/mall-capabilities';
import {
  CAPABILITY_ICON,
  CAPABILITY_LABEL,
  CAPABILITY_STATES,
  STATE_FILL,
  STATE_WORD,
} from './CapabilityPill';

/**
 * 쇼핑몰 현황 맨 위 요약 — 숫자 여섯 칸.
 *
 * 활성 상품 · 연결된 몰, 그리고 되는 일 넷(주문수집 · 송장전송 · 상품등록 · 품절관리)이
 * 연결된 몰 중 몇 곳에서 되는지. 막대는 아래 카드와 같은 색이다 — 초록 됨 · 회색 아직 ·
 * 빨강 불가.
 *
 * 예전 띠(상품이 들어오는 곳 → KidItem → 몰)는 고정 글자와 아래 목록의 숫자를 되풀이할
 * 뿐이라 뺐다(사장님 지적 2026-09-11). 여기 서는 숫자는 모두 지금 상황을 말한다.
 */
export function ChannelSummary({
  productCount,
  connectedCount,
  totals,
}: {
  productCount: number;
  connectedCount: number;
  totals: CapabilityTotals;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Figure icon={Boxes} label="활성 상품" value={productCount} caption="상품 마스터 기준" />
      <Figure icon={Plug} label="연결된 몰" value={connectedCount} caption="계정이 연결된 몰" />
      {CAPABILITY_KEYS.map((key) => (
        <CapabilityMeter key={key} kind={key} counts={totals[key]} />
      ))}
    </div>
  );
}

function Figure({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900">{formatNumber(value)}</div>
      <p className="mt-2 text-xs text-slate-400">{caption}</p>
    </div>
  );
}

/**
 * 한 가지 일이 연결된 몰 중 몇 곳에서 되는가.
 *
 * 막대 한 줄을 됨 · 아직 · 불가 몫으로 나눈다. 칸 사이는 2px 틈으로 가르고(테두리를 긋지
 * 않는다), 몫은 너비가 아니라 비율(`flex-grow`)로 줘서 틈이 있어도 넘치지 않는다. 막대만
 * 보고 읽게 하지 않는다 — 숫자와 글자 풀이가 옆에 선다.
 */
function CapabilityMeter({
  kind,
  counts,
}: {
  kind: CapabilityKey;
  counts: CapabilityTotals[CapabilityKey];
}) {
  const Icon = CAPABILITY_ICON[kind];
  const total = counts.ready + counts.pending + counts.unavailable;
  const label = CAPABILITY_LABEL[kind];
  const summary = [
    `${label} ${formatNumber(total)}곳 중 ${formatNumber(counts.ready)}곳 됨`,
    `${formatNumber(counts.pending)}곳 아직`,
    ...(counts.unavailable > 0 ? [`${formatNumber(counts.unavailable)}곳 불가`] : []),
  ].join(', ');
  return (
    <div className="card">
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-bold text-slate-900">{formatNumber(counts.ready)}</span>
        <span className="text-sm text-slate-400">/ {formatNumber(total)}곳</span>
      </div>
      <div role="img" aria-label={summary} className="mt-3 flex h-2 w-full gap-0.5">
        {CAPABILITY_STATES.filter((state) => counts[state] > 0).map((state) => (
          <span
            key={state}
            title={`${STATE_WORD[state]} ${formatNumber(counts[state])}곳`}
            className={cn('h-full basis-0 first:rounded-l-full last:rounded-r-full', STATE_FILL[state])}
            style={{ flexGrow: counts[state] }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {counts.pending > 0 ? `아직 ${formatNumber(counts.pending)}곳` : '연결된 몰 전부 됨'}
        {counts.unavailable > 0 ? ` · 불가 ${formatNumber(counts.unavailable)}곳` : ''}
      </p>
    </div>
  );
}
