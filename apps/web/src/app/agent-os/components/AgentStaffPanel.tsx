'use client';

import { UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

const STATUS_DOT_CLASS = {
  working: 'bg-sky-400',
  waiting: 'bg-amber-300',
  blocked: 'bg-rose-400',
  idle: 'bg-emerald-400',
  offline: 'bg-slate-400',
} satisfies Record<AgentOfficeViewModel['nodes'][number]['status'], string>;

export function AgentStaffPanel({
  model,
  selectedNodeId,
  onSelectNode,
}: {
  model: AgentOfficeViewModel;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  return (
    <aside
      aria-label="인력 배치"
      className="max-h-[calc(100vh-140px)] overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <UsersRound size={15} />
          <span>인력 배치</span>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
          {model.totals.employees}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        능력 {model.totals.capabilities} · 승인 {model.totals.pendingApprovals}
      </p>
      <div className="mt-4 space-y-2">
        {model.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            aria-pressed={selectedNodeId === node.id}
            onClick={() => onSelectNode(node.id)}
            className={cn(
              'flex min-h-14 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-xs transition',
              selectedNodeId === node.id
                ? 'border-purple-300 bg-purple-50 text-purple-900'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <span
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                STATUS_DOT_CLASS[node.status],
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{node.displayName}</span>
              <span className="block truncate text-[11px] text-slate-500">
                {node.responsibility}
              </span>
            </span>
            {node.configurationStatus === 'ready' ? (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                {node.activeRunCount + node.pendingApprovalCount}
              </span>
            ) : (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                설정 필요
              </span>
            )}
          </button>
        ))}
      </div>
    </aside>
  );
}
