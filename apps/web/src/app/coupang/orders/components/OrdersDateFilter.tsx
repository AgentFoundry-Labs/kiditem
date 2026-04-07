'use client';
import { type DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/DateRangePicker';

const PRESETS = [
  { label: '7일', days: 7 },
  { label: '30일', days: 30 },
  { label: '90일', days: 90 },
];

interface Props {
  activePreset: number;
  dateRange: DateRange;
  onPreset: (days: number) => void;
  onCustomRange: (range: DateRange | undefined) => void;
}

export default function OrdersDateFilter({ activePreset, dateRange, onPreset, onCustomRange }: Props) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="page-title">주문 대시보드</h1>
      <div className="flex items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => onPreset(p.days)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg border',
              activePreset === p.days
                ? 'bg-purple-50 text-purple-600 border-purple-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            {p.label}
          </button>
        ))}
        <DateRangePicker value={dateRange} onChange={onCustomRange} />
      </div>
    </div>
  );
}
