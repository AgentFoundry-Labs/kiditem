'use client';

import { CircleAlert, Clock3, Coins, UsersRound, Zap } from 'lucide-react';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

export function AgentStatusRail({ totals }: { totals: AgentOfficeViewModel['totals'] }) {
  const items = [
    { label: '직원', value: totals.agents, icon: UsersRound },
    { label: '작업', value: totals.working, icon: Zap },
    { label: '대기', value: totals.waiting, icon: Clock3 },
    { label: '승인', value: totals.pendingApprovals, icon: CircleAlert },
    { label: '비용', value: totals.totalCostMicros, icon: Coins },
  ];

  return (
    <section className="grid grid-cols-2 gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface)] p-3 md:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="flex min-h-14 items-center gap-2 rounded-md border border-[var(--border-subtle)] px-3"
          >
            <Icon size={15} className="text-[var(--text-tertiary)]" />
            <span className="min-w-0">
              <span className="block text-[11px] text-[var(--text-tertiary)]">{item.label}</span>
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                {item.value}
              </span>
            </span>
          </div>
        );
      })}
    </section>
  );
}
