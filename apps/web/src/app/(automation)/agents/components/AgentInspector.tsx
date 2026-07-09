'use client';

import { ShieldCheck, TimerReset } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { AgentOfficeNode } from '../lib/agent-office-model';

export function AgentInspector({ node }: { node: AgentOfficeNode | null }) {
  if (!node) {
    return (
      <aside className="min-h-[260px] border-l border-[var(--border-subtle)] bg-[var(--surface)] p-4 text-sm text-[var(--text-tertiary)]">
        직원을 선택하세요.
      </aside>
    );
  }

  return (
    <aside className="min-h-[260px] border-l border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">
            {node.name}
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">{node.title ?? node.agentType}</p>
        </div>
        <span className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
          {node.status}
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-md border border-[var(--border-subtle)] p-3">
          <dt className="flex items-center gap-1 text-[var(--text-tertiary)]">
            <TimerReset size={13} /> 실행
          </dt>
          <dd className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            {node.activeRunCount}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border-subtle)] p-3">
          <dt className="flex items-center gap-1 text-[var(--text-tertiary)]">
            <ShieldCheck size={13} /> 승인
          </dt>
          <dd className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            {node.pendingApprovalCount}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-[var(--text-tertiary)]">
        마지막 활동 {node.lastActivityAt ? formatDateTime(node.lastActivityAt) : '없음'}
      </p>
    </aside>
  );
}
