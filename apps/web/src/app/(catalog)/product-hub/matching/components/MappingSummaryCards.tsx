'use client';

import { AlertTriangle, Boxes, CheckCircle2, CircleDashed, PackageSearch } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { ChannelProductMatchingCounts } from '@kiditem/shared/channel-product-matching';

type Props = { counts: ChannelProductMatchingCounts; loading: boolean };

export function MappingSummaryCards({ counts, loading }: Props) {
  const cards = [
    { label: '운영 상품 연결', value: `${formatNumber(counts.products.linked)} / ${formatNumber(counts.products.all)}`, icon: PackageSearch, color: 'text-purple-600' },
    { label: '운영 옵션 연결', value: `${formatNumber(counts.options.linked)} / ${formatNumber(counts.options.all)}`, icon: Boxes, color: 'text-blue-600' },
    { label: 'Sellpia 레시피 확정', value: `${formatNumber(counts.options.recipeConfirmed)} / ${formatNumber(counts.options.linked)}`, icon: CheckCircle2, color: 'text-emerald-600' },
    { label: '미연결 상품', value: formatNumber(counts.products.unlinked), icon: CircleDashed, color: 'text-slate-600' },
    { label: '미연결 옵션', value: formatNumber(counts.options.unlinked), icon: CircleDashed, color: 'text-slate-600' },
    { label: '레시피 구성 필요', value: formatNumber(counts.options.configurationRequired), icon: AlertTriangle, color: 'text-amber-600' },
    { label: '레시피 검토 필요', value: formatNumber(counts.options.reviewRequired), icon: AlertTriangle, color: 'text-amber-600' },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{card.label}</span>
            <card.icon size={16} className={card.color} />
          </div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${card.color}`}>
            {loading ? '—' : card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
