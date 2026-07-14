'use client';

import { cn, formatNumber } from '@/lib/utils';
import type {
  ChannelSkuMappingCounts,
  ChannelSkuMappingStatus,
} from '@kiditem/shared/channel-sku-matching';

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
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            active === tab.status
              ? 'bg-purple-600 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          {tab.label}
          {' '}
          <span
            className={cn(
              'ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs tabular-nums',
              active === tab.status
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 text-slate-600',
            )}
          >
            {formatNumber(counts[tab.countKey])}
          </span>
        </button>
      ))}
    </div>
  );
}
