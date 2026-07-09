'use client';

import { Bot, CircleAlert, Clock3, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentOfficeNode as AgentOfficeNodeModel } from '../lib/agent-office-model';

const STATUS_CLASS = {
  working: 'border-sky-400 bg-sky-50 text-sky-800',
  waiting: 'border-amber-400 bg-amber-50 text-amber-800',
  blocked: 'border-rose-400 bg-rose-50 text-rose-800',
  idle: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  offline: 'border-slate-300 bg-slate-100 text-slate-500',
} satisfies Record<AgentOfficeNodeModel['status'], string>;

function nodePositionStyle(x: number, y: number) {
  if (x <= 25) {
    return { left: `${x}%`, top: `${y}%`, marginLeft: '0px', marginTop: '-37px' };
  }

  if (x >= 75) {
    return { left: `${x}%`, top: `${y}%`, marginLeft: '-142px', marginTop: '-37px' };
  }

  return { left: `${x}%`, top: `${y}%`, marginLeft: '-71px', marginTop: '-37px' };
}

function StatusIcon({ status }: { status: AgentOfficeNodeModel['status'] }) {
  if (status === 'blocked') return <CircleAlert size={14} />;
  if (status === 'waiting') return <Clock3 size={14} />;
  if (status === 'offline') return <PauseCircle size={14} />;
  return <Bot size={14} />;
}

export function AgentOfficeNode({
  node,
  selected,
  onSelect,
}: {
  node: AgentOfficeNodeModel;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
      className={cn(
        'absolute flex h-[74px] w-[142px] items-center gap-2 rounded-md border px-3 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md',
        STATUS_CLASS[node.status],
        selected && 'ring-2 ring-[var(--primary)] ring-offset-2',
      )}
      style={nodePositionStyle(node.x, node.y)}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80">
        <StatusIcon status={node.status} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{node.name}</span>
        <span className="block truncate text-[11px]">{node.title ?? node.agentType}</span>
      </span>
    </button>
  );
}
