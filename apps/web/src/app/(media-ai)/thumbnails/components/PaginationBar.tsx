'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationBarProps {
  current: number;
  total: number;
  count: number;
  pageSize: number;
  onChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function PaginationBar({ current, total, count, pageSize, onChange, onPageSizeChange }: PaginationBarProps) {
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, count);

  return (
    <div className="flex items-center justify-between text-slate-400">
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono">{count}개 중 {from}-{to}</span>
        {onPageSizeChange && (
          <div className="flex items-center gap-0.5 rounded-lg p-0.5 bg-slate-50">
            {[20, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => onPageSizeChange(size)}
                className={cn('px-2 py-0.5 rounded-md text-[13px] font-semibold transition-colors', pageSize === size ? 'bg-purple-600 text-white' : 'text-slate-400')}
              >
                {size}
              </button>
            ))}
          </div>
        )}
      </div>
      {total > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange(Math.max(1, current - 1))}
            disabled={current === 1}
            className="px-2 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors bg-slate-50"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="px-3 text-xs font-semibold tabular-nums">{current} / {total}</span>
          <button
            onClick={() => onChange(Math.min(total, current + 1))}
            disabled={current === total}
            className="px-2 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors bg-slate-50"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
