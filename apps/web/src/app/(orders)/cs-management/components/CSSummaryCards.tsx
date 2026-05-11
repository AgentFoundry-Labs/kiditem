'use client';

import { cn } from '@/lib/utils';

interface CSSummary {
  total: number;
  접수: number;
  처리중: number;
  완료: number;
}

interface Props {
  summary: CSSummary;
}

export function CSSummaryCards({ summary }: Props) {
  const cards = [
    { label: '전체', value: summary.total, color: 'text-slate-900', bg: 'bg-white' },
    { label: '접수', value: summary.접수, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: '처리중', value: summary.처리중, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: '완료', value: summary.완료, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className={cn('card', card.bg)}>
          <div className="card-label">{card.label}</div>
          <div className={cn('card-value', card.color)}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}
