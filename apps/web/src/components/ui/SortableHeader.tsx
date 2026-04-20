'use client';

import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Direction = 'asc' | 'desc' | null;

interface Props<F extends string> {
  field: F;
  label: string;
  activeField: F | null;
  direction: Direction;
  onSort: (field: F) => void;
  align?: 'left' | 'right';
  className?: string;
}

/**
 * 공용 정렬 가능 테이블 헤더 (<th> + button).
 *
 * Plan D.1 에서 `profit-loss/components/ProfitLossTable.tsx:134-156` 의 inline
 * 구현을 extract. Plan D.2 이후 sales-analysis / settlements 등 다른 table 에서도
 * 재사용한다.
 *
 * 접근성: aria-sort 로 현재 정렬 상태를 스크린리더에 전달한다 (I5 invariant).
 */
export default function SortableHeader<F extends string>({
  field,
  label,
  activeField,
  direction,
  onSort,
  align = 'right',
  className,
}: Props<F>) {
  const isActive = activeField === field;
  const ariaSort: 'ascending' | 'descending' | 'none' =
    isActive && direction === 'asc' ? 'ascending'
    : isActive && direction === 'desc' ? 'descending'
    : 'none';

  const Icon =
    !isActive ? ArrowUpDown
    : direction === 'asc' ? ArrowUp
    : ArrowDown;

  const iconClass = isActive ? 'text-purple-600' : 'text-slate-400';

  return (
    <th
      aria-sort={ariaSort}
      className={cn(align === 'right' ? 'text-right' : 'text-left', className)}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1.5 hover:text-slate-900',
          align === 'right' && 'ml-auto justify-end'
        )}
      >
        <span>{label}</span>
        <Icon size={14} className={iconClass} aria-hidden="true" />
      </button>
    </th>
  );
}
