'use client';

import { Boxes, Plug } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

/**
 * 쇼핑몰 현황 맨 위 요약 — 활성 상품 · 연결된 몰.
 *
 * 되는 일마다 몇 곳에서 되는지는 아래 표의 칸 머리가 말한다(사방넷 스케줄러와 같은 표,
 * 사장님 2026-09-17). 같은 숫자를 위아래에 두 번 적지 않는다.
 */
export function ChannelSummary({
  productCount,
  connectedCount,
}: {
  productCount: number;
  connectedCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:max-w-xl">
      <Figure icon={Boxes} label="활성 상품" value={productCount} caption="상품 마스터 기준" />
      <Figure icon={Plug} label="연결된 몰" value={connectedCount} caption="계정이 연결된 몰" />
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
