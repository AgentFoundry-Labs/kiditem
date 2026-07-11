'use client';

import { ChevronDown } from 'lucide-react';
import { formatKRW, formatNumber } from '@/lib/utils';
import type { ProductListItem as Product } from '../lib/product-types';
import type { GradeMap } from '../lib/abc-grading';
import type { ProductGradeChange } from '../hooks/useProductGradeChanges';
import { ProductRowCard } from './ProductRowCard';

interface Props {
  group: Product[];
  gradeMap: GradeMap;
  gradeChangesByProductId?: Map<string, ProductGradeChange>;
  isExpanded: boolean;
  onToggle: () => void;
}

function trafficRevenue(p: Product): number {
  return p.t14?.revenue ?? p.traffic?.revenue ?? 0;
}
function trafficSalesQty(p: Product): number {
  return p.t14?.salesQty ?? p.traffic?.salesQty ?? 0;
}

export function ProductGroupRow({ group, gradeMap, gradeChangesByProductId, isExpanded, onToggle }: Props) {
  const groupName = group[0].name;
  const groupRevenue = group.reduce((s, p) => s + trafficRevenue(p), 0);
  const groupQty = group.reduce((s, p) => s + trafficSalesQty(p), 0);
  const head = group[0];
  const headImg = head.thumbnailUrl || head.imageUrl;

  return (
    <div className="space-y-1.5">
      <div
        className="flex cursor-pointer select-none items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-5 py-3.5 transition-colors hover:bg-[var(--surface-sunken)]"
        onClick={onToggle}
      >
        <div className="w-7 shrink-0 flex items-center justify-center">
          <ChevronDown
            size={16}
            className="text-[var(--text-tertiary)] transition-transform duration-200"
            style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        </div>
        {headImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={headImg} alt={groupName} className="h-10 w-10 shrink-0 rounded-lg border border-[var(--border-subtle)] object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-lg bg-[var(--surface-sunken)]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-[var(--text-primary)]">{groupName}</span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              {group.length}개 옵션
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {group.map(p => p.sku || p.coupangProductId).filter(Boolean).slice(0, 4).join(' · ')}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[20px] font-black tabular-nums text-[var(--text-primary)]">{formatKRW(groupRevenue)}</div>
          <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">합계 매출 · 판매량 {formatNumber(groupQty)}</div>
        </div>
      </div>

      {isExpanded && (
        <div className="pl-5 space-y-1.5">
          {group.map(p => (
            <ProductRowCard
              key={p.id}
              product={p}
              gradeMap={gradeMap}
              gradeChange={gradeChangesByProductId?.get(p.id)}
              isChild
            />
          ))}
        </div>
      )}
    </div>
  );
}
