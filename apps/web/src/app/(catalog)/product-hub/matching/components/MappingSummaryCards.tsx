'use client';

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Sparkles,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { ChannelSkuMappingCounts } from '@kiditem/shared/channel-sku-matching';

type MappingSummaryCardsProps = {
  counts: ChannelSkuMappingCounts;
  loading: boolean;
};

const CARDS: ReadonlyArray<{
  label: string;
  countKey: keyof ChannelSkuMappingCounts;
  icon: typeof Sparkles;
  color: string;
}> = [
  { label: '전체 채널 SKU', countKey: 'all', icon: Sparkles, color: 'text-purple-600' },
  { label: '미매칭', countKey: 'unmatched', icon: CircleDashed, color: 'text-slate-600' },
  { label: '확인 필요', countKey: 'needsReview', icon: AlertTriangle, color: 'text-amber-600' },
  { label: '매칭 완료', countKey: 'matched', icon: CheckCircle2, color: 'text-emerald-600' },
];

export function MappingSummaryCards({
  counts,
  loading,
}: MappingSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {CARDS.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-xl border border-slate-200 p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{card.label}</span>
            <card.icon size={16} className={card.color} />
          </div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${card.color}`}>
            {loading ? '—' : formatNumber(counts[card.countKey])}
          </div>
        </div>
      ))}
    </div>
  );
}
