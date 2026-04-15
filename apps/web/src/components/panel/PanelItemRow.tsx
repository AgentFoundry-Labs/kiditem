'use client';

import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { PANEL_RUN_SOURCES } from '@kiditem/shared';
import type { PanelItem, PanelRunItem } from '@kiditem/shared';
import { cn } from '@/lib/utils';

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>;

export function PanelItemRow({ item }: { item: PanelItem }) {
  if (item.kind === 'run') return <RunRow item={item} />;
  return null; // PR2에서 AlertRow 추가
}

function RunRow({ item }: { item: PanelRunItem }) {
  const router = useRouter();
  const meta = PANEL_RUN_SOURCES[item.source];
  // Icon lookup: cast via unknown to avoid LucideProps vs IconComponentProps mismatch
  const IconComponent = ((Icons as unknown as Record<string, LucideIcon>)[meta.iconName] ?? Icons.Box) as LucideIcon;

  return (
    <button
      onClick={() => router.push(item.deepLink)}
      className="w-full flex items-start gap-2.5 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50"
    >
      <div className={cn(
        'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
        item.status === 'succeeded' && 'bg-emerald-100 text-emerald-700',
        item.status === 'failed' && 'bg-red-100 text-red-700',
        item.status === 'cancelled' && 'bg-slate-100 text-slate-500',
        (item.status === 'pending' || item.status === 'running') && 'bg-violet-100 text-violet-700',
      )}>
        <IconComponent className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 text-sm font-medium text-slate-900">
          <span className="truncate">{item.title}</span>
        </div>
        {item.subtitle && (
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              (item.status === 'pending' || item.status === 'running') && 'bg-violet-400 animate-pulse',
              item.status === 'succeeded' && 'bg-emerald-500',
              item.status === 'failed' && 'bg-red-500',
              item.status === 'cancelled' && 'bg-slate-400',
            )} />
            {item.subtitle}
          </div>
        )}
        {item.progress !== undefined && (
          <div className="h-0.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-violet-400"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </div>
        )}
      </div>
    </button>
  );
}
