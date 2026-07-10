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
    <section
      id="agent-system-activity"
      aria-label="시스템 활동 기록"
      className="max-h-[240px] overflow-auto rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm"
    >
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-2">
        <h2 className="text-xs font-semibold">시스템 활동 기록</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          실행 · 승인 · 비용 · 권한 이벤트
        </p>
      </div>
      {activities.length === 0 ? (
        <p className="px-3 py-5 text-center text-xs text-slate-500">
          기록된 시스템 활동이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {activities.slice(0, 8).map((activity) => (
            <li
              key={`${activity.kind}:${activity.id}`}
              className="flex items-center gap-3 px-3 py-2 text-xs"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-50 text-purple-600">
                <ActivityIcon kind={activity.kind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">
                  {activity.label}
                </span>
                <span className="block truncate text-slate-500">
                  {activity.status} · {formatDateTime(activity.occurredAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
