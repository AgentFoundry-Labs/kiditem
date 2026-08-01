'use client';

import Link from 'next/link';
import {
  Activity,
  Ban,
  Bot,
  Box,
  CheckCircle2,
  EyeOff,
  Image,
  Loader2,
  Workflow,
  XCircle,
} from 'lucide-react';
import { PANEL_RUN_SOURCES } from '@kiditem/shared/panel';
import { cn, timeAgo } from '@/lib/utils';
import { PanelAlertRow } from './PanelAlertRow';
import { usePanelStore } from './lib/panel-store';
import type { LucideIcon } from 'lucide-react';
import type { PanelItem, PanelRunItem } from '@kiditem/shared/panel';

const PANEL_ICONS: Record<string, LucideIcon> = {
  Bot,
  Activity,
  Box,
  Image,
  Workflow,
};

export function PanelItemRow({ item }: { item: PanelItem }) {
  if (item.kind === 'run') return <RunRow item={item} />;
  if (item.kind === 'alert') return <PanelAlertRow item={item} />;
  return null;
}

function RunRow({ item }: { item: PanelRunItem }) {
  const hideRunItems = usePanelStore((state) => state.hideRunItems);
  const meta = PANEL_RUN_SOURCES[item.source];
  const IconComponent = PANEL_ICONS[meta.iconName] ?? Box;
  const badge = runStatusBadge(item.status);
  const active = item.status === 'pending' || item.status === 'running';

  return (
    <div className="group flex w-full items-start gap-2.5 border-b border-slate-50 px-4 py-3">
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
        item.status === 'succeeded' && 'bg-emerald-50 text-emerald-600',
        item.status === 'failed' && 'bg-red-50 text-red-600',
        item.status === 'cancelled' && 'bg-slate-100 text-slate-500',
        active && 'bg-blue-50 text-blue-500',
      )}>
        <IconComponent className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-900">{item.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
              badge.className,
            )}
            aria-label={`상태: ${badge.label}`}
          >
            <badge.Icon className={cn('h-3 w-3', item.status === 'running' && 'animate-spin')} />
            {badge.label}
          </span>
          <span className="text-[10px] text-slate-400">{meta.label}</span>
        </div>
        {active && item.progress !== undefined && (
          <div
            className="mt-1 h-1 w-full overflow-hidden rounded bg-slate-100"
            role="progressbar"
            aria-valuenow={Math.round(item.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-blue-500 transition-[width]"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </div>
        )}
        {item.subtitle && (
          <div className="mt-0.5 truncate text-xs text-slate-500">{item.subtitle}</div>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs text-slate-400">{timeAgo(item.createdAt)}</span>
          <Link href={item.deepLink} className="text-xs text-purple-600 hover:underline">
            이동
          </Link>
        </div>
      </div>
      {active && (
        <button
          type="button"
          onClick={() => hideRunItems([item.id])}
          aria-label="워크플로우 화면에서 숨기기"
          title="실제 실행은 중단하지 않고 이 브라우저의 알림 화면에서만 숨깁니다"
          className="rounded border border-slate-200 p-1 text-slate-400 opacity-0 transition hover:bg-slate-50 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100"
        >
          <EyeOff className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function runStatusBadge(status: PanelRunItem['status']): {
  label: string;
  className: string;
  Icon: typeof Loader2;
} {
  if (status === 'running') {
    return { label: '진행 중', className: 'bg-blue-50 text-blue-600', Icon: Loader2 };
  }
  if (status === 'pending') {
    return { label: '대기 중', className: 'bg-blue-50 text-blue-600', Icon: Loader2 };
  }
  if (status === 'succeeded') {
    return { label: '완료', className: 'bg-emerald-50 text-emerald-600', Icon: CheckCircle2 };
  }
  if (status === 'failed') {
    return { label: '실패', className: 'bg-red-50 text-red-600', Icon: XCircle };
  }
  return { label: '취소', className: 'bg-slate-100 text-slate-500', Icon: Ban };
}
