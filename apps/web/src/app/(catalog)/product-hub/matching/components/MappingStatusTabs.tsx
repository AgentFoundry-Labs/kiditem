'use client';

import type {
  ChannelSkuMappingCounts,
  ChannelSkuMappingStatus,
} from '@kiditem/shared/channel-sku-matching';
import { cn, formatNumber } from '@/lib/utils';

export type MappingStatusFilter = ChannelSkuMappingStatus | 'all';

type MappingStatusTabsProps = {
  active: MappingStatusFilter;
  counts: ChannelSkuMappingCounts;
  onChange: (status: MappingStatusFilter) => void;
};

const TABS: ReadonlyArray<{
  status: MappingStatusFilter;
  label: string;
  countKey: keyof ChannelSkuMappingCounts;
}> = [
  { status: 'all', label: '전체', countKey: 'all' },
  { status: 'unmatched', label: '미매칭', countKey: 'unmatched' },
  { status: 'needs_review', label: '확인 필요', countKey: 'needsReview' },
  { status: 'matched', label: '매칭 완료', countKey: 'matched' },
];

export function MappingStatusTabs({
  active,
  counts,
  onChange,
}: MappingStatusTabsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="매칭 상태 필터">
      {TABS.map((tab) => (
        <button
          key={tab.status}
          type="button"
          aria-pressed={active === tab.status}
          onClick={() => onChange(tab.status)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
            active === tab.status
              ? 'border-[var(--primary,#7048e8)] bg-[var(--primary,#7048e8)] text-white'
              : 'border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)] text-[var(--text-secondary,#475569)] hover:bg-[var(--surface-sunken,#f8fafc)]',
          )}
        >
          {tab.label} {formatNumber(counts[tab.countKey])}
        </button>
      ))}
    </div>
  );
}
