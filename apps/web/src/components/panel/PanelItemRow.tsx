'use client';

import { useRouter } from 'next/navigation';
import { Bot, Box, EyeOff, Image, Workflow } from 'lucide-react';
import { PANEL_RUN_SOURCES } from '@kiditem/shared/panel';
import { cn } from '@/lib/utils';
import { PanelAlertRow } from './PanelAlertRow';
import { usePanelStore } from './lib/panel-store';
import type { LucideIcon } from 'lucide-react';
import type { PanelItem, PanelRunItem } from '@kiditem/shared/panel';

const PANEL_ICONS: Record<string, LucideIcon> = {
  Bot,
  Box,
  Image,
  Workflow,
};

export function PanelItemRow({ item }: { item: PanelItem }) {
  if (item.kind === 'run') return <RunRow item={item} />;
  if (item.kind === 'alert') return <PanelAlertRow item={item} />;
  return null; // exhaustive — never
}

function RunRow({ item }: { item: PanelRunItem }) {
  const router = useRouter();
  const hideRunItems = usePanelStore((state) => state.hideRunItems);
  const meta = PANEL_RUN_SOURCES[item.source];
  const IconComponent = PANEL_ICONS[meta.iconName] ?? Box;
  const isActive = item.status === 'pending' || item.status === 'running';

  return (
    <div className="group flex items-start gap-1 border-b border-slate-50">
      <button
        type="button"
        onClick={() => router.push(item.deepLink)}
        className="flex flex-1 items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <div className={cn(
          'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
          item.status === 'succeeded' && 'bg-emerald-100 text-emerald-700',
          item.status === 'failed' && 'bg-red-100 text-red-700',
          item.status === 'cancelled' && 'bg-slate-100 text-slate-500',
          isActive && 'bg-violet-100 text-violet-700',
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
                isActive && 'bg-violet-400 animate-pulse',
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
      {isActive && (
        <button
          type="button"
          onClick={() => hideRunItems([item.id])}
          aria-label="워크플로우 화면에서 숨기기"
          title="실제 실행은 중단하지 않고 이 화면에서만 숨깁니다"
          className="mr-3 mt-3 rounded border border-gray-300 p-1 text-slate-400 opacity-0 transition hover:bg-gray-50 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100"
        >
          <EyeOff className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
