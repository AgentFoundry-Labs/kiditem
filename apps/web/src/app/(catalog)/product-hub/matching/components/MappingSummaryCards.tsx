'use client';

import { AlertTriangle, Boxes, CheckCircle2, CircleDashed, PackageSearch } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { ChannelProductMatchingCounts } from '@kiditem/shared/channel-product-matching';

type Props = { counts: ChannelProductMatchingCounts; loading: boolean };

export function MappingSummaryCards({ counts, loading }: Props) {
  const cards = [
    { label: '전체 채널 상품', value: counts.products.all, icon: PackageSearch, color: 'text-purple-600' },
    { label: '미매칭 상품', value: counts.products.unmatched, icon: CircleDashed, color: 'text-slate-600' },
    { label: '전체 채널 옵션', value: counts.options.all, icon: Boxes, color: 'text-blue-600' },
    { label: '연결 완료 옵션', value: counts.options.matched, icon: CheckCircle2, color: 'text-emerald-600' },
    { label: '레시피 확인 필요', value: counts.options.configurationRequired + counts.options.reviewRequired, icon: AlertTriangle, color: 'text-amber-600' },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{card.label}</span>
            <card.icon size={16} className={card.color} />
          </div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${card.color}`}>
            {loading ? '—' : formatNumber(card.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
