'use client';

import Link from 'next/link';
import {
  Activity,
  Bot,
  Circle,
  LayoutDashboard,
  RefreshCw,
} from 'lucide-react';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

export function AgentOfficeHeader({
  totals,
  refreshing,
  activityOpen,
  onRefresh,
  onToggleActivity,
}: {
  totals: AgentOfficeViewModel['totals'];
  refreshing: boolean;
  activityOpen: boolean;
  onRefresh: () => void;
  onToggleActivity: () => void;
}) {
  const summaries = [
    {
      label: '집중 중',
      value: totals.working,
      color: 'fill-sky-300 text-sky-300',
    },
    {
      label: '대기 중',
      value: totals.waiting,
      color: 'fill-amber-300 text-amber-300',
    },
    {
      label: '승인 필요',
      value: totals.pendingApprovals,
      color: 'fill-rose-300 text-rose-300',
    },
  ];

  return (
    <header className="flex h-14 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-500 text-white">
          <Bot size={18} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Agent OS 사무실</h1>
          <p className="truncate text-[11px] text-slate-500">
            Operator · Hermes · KidItem MCP
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        {summaries.map((summary) => (
          <span
            key={summary.label}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-600"
          >
            <Circle size={7} className={summary.color} />
            <span>{summary.label}</span>
            <strong className="font-semibold text-slate-900">
              {summary.value}
            </strong>
          </span>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
          직원 {totals.employees}명 · 능력 {totals.capabilities}개
        </span>
        <button
          type="button"
          aria-label={activityOpen ? '시스템 활동 기록 닫기' : '시스템 활동 기록 열기'}
          aria-expanded={activityOpen}
          aria-controls="agent-system-activity"
          onClick={onToggleActivity}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          title="시스템 활동 기록"
        >
          <Activity size={16} />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="새로고침"
          title="새로고침"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <LayoutDashboard size={16} />
          <span>대시보드</span>
        </Link>
      </div>
    </header>
  );
}
