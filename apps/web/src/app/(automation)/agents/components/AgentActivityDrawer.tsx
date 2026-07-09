'use client';

import {
  Activity,
  BadgeCheck,
  Coins,
  LockKeyhole,
  MessageSquare,
  PlayCircle,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { AgentOfficeActivity } from '../lib/agent-office-model';

function ActivityIcon({ kind }: { kind: AgentOfficeActivity['kind'] }) {
  if (kind === 'approval') return <BadgeCheck size={14} />;
  if (kind === 'cost') return <Coins size={14} />;
  if (kind === 'authorization') return <LockKeyhole size={14} />;
  if (kind === 'conversation') return <MessageSquare size={14} />;
  if (kind === 'run') return <PlayCircle size={14} />;
  return <Activity size={14} />;
}

export function AgentActivityDrawer({
  activities,
}: {
  activities: AgentOfficeActivity[];
}) {
  return (
    <section className="max-h-[220px] overflow-auto border-t border-[var(--border-subtle)] bg-[var(--surface)]">
      <ul className="divide-y divide-[var(--border-subtle)]">
        {activities.slice(0, 20).map((activity) => (
          <li
            key={`${activity.kind}:${activity.id}`}
            className="flex items-center gap-3 px-4 py-2.5 text-xs"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
              <ActivityIcon kind={activity.kind} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[var(--text-primary)]">
                {activity.label}
              </span>
              <span className="block truncate text-[var(--text-tertiary)]">
                {activity.status} · {formatDateTime(activity.occurredAt)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
