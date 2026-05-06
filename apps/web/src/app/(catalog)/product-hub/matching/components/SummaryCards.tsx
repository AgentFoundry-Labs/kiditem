'use client';

import type { ReconciliationSummary } from '@kiditem/shared/channel-reconciliation';
import { CheckCircle2, AlertTriangle, AlertCircle, Slash, Sparkles } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface SummaryCardsProps {
  summary: ReconciliationSummary | undefined;
  loading: boolean;
}

export function SummaryCards({ summary, loading }: SummaryCardsProps) {
  const cards: Array<{
    label: string;
    value: number;
    icon: typeof CheckCircle2;
    iconClass: string;
    valueClass: string;
  }> = [
    {
      label: '총 매칭 row',
      value: summary?.total ?? 0,
      icon: Sparkles,
      iconClass: 'text-purple-600',
      valueClass: 'text-slate-900',
    },
    {
      label: '자동 연결',
      value: summary?.autoLinked ?? 0,
      icon: CheckCircle2,
      iconClass: 'text-green-600',
      valueClass: 'text-green-600',
    },
    {
      label: '확인 필요',
      value: summary?.needsReview ?? 0,
      icon: AlertTriangle,
      iconClass: 'text-amber-500',
      valueClass: 'text-amber-600',
    },
    {
      label: '충돌',
      value: summary?.conflict ?? 0,
      icon: AlertCircle,
      iconClass: 'text-red-600',
      valueClass: 'text-red-600',
    },
    {
      label: '제외',
      value: summary?.ignored ?? 0,
      icon: Slash,
      iconClass: 'text-slate-400',
      valueClass: 'text-slate-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-xl border border-slate-200 p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{card.label}</span>
            <card.icon size={16} className={card.iconClass} />
          </div>
          <div className={`text-2xl font-bold tabular-nums mt-1 ${card.valueClass}`}>
            {loading ? '—' : formatNumber(card.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
