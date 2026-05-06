'use client';

import { cn } from '@/lib/utils';
import type { ReconciliationStatusFilter } from '../hooks/useReconciliation';

interface StatusTabsProps {
  active: ReconciliationStatusFilter;
  onChange: (next: ReconciliationStatusFilter) => void;
  counts: {
    autoLinked: number;
    needsReview: number;
    conflict: number;
    linked: number;
    ignored: number;
  };
}

const TABS: Array<{ key: ReconciliationStatusFilter; label: string; countKey: keyof StatusTabsProps['counts'] }> = [
  { key: 'auto_linked', label: '자동 연결', countKey: 'autoLinked' },
  { key: 'needs_review', label: '확인 필요', countKey: 'needsReview' },
  { key: 'conflict', label: '충돌', countKey: 'conflict' },
  { key: 'linked', label: '처리 완료', countKey: 'linked' },
  { key: 'ignored', label: '제외', countKey: 'ignored' },
];

export function StatusTabs({ active, onChange, counts }: StatusTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {TABS.map((tab) => {
        const count = counts[tab.countKey];
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-purple-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            {tab.label}
            <span
              className={cn(
                'ml-2 inline-flex items-center justify-center min-w-[20px] px-1.5 rounded-full text-xs tabular-nums',
                isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-600',
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
