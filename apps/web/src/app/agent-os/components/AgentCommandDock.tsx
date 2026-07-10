'use client';

import { Bot, CircleUserRound, Sparkles } from 'lucide-react';
import { getAgentCommandPresets } from '../lib/agent-command-presets';
import { AgentCommandBar } from './AgentCommandBar';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const STATUS_LABEL = {
  working: '집중 중',
  waiting: '대기 중',
  blocked: '승인 필요',
  idle: '준비됨',
  offline: '오프라인',
} satisfies Record<AgentOfficeNode['status'], string>;

export function AgentCommandDock({
  node,
  value,
  pending,
  onChange,
  onSubmit,
}: {
  node: AgentOfficeNode | null;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const presets = getAgentCommandPresets(node?.agentType ?? null);

  return (
    <section
      aria-label="선택 직원 업무 지시"
      className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-slate-900 shadow-sm"
    >
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600">
          {node ? <CircleUserRound size={22} /> : <Bot size={22} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {node?.displayName ?? '직원을 선택하세요'}
          </p>
          {node ? (
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
              <span>{STATUS_LABEL[node.status]}</span>
              <span aria-hidden="true">·</span>
              <span>운영 총괄을 통해 업무 배정</span>
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-slate-500">
              운영 총괄에게 직접 지시할 수 있습니다
            </p>
          )}
        </div>
        {node ? (
          <span className="shrink-0 rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] text-purple-700">
            능력 {node.capabilities.length}
          </span>
        ) : null}
      </div>
      <div className="flex gap-2 overflow-x-auto py-2">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-label={`빠른 지시: ${preset}`}
            onClick={() => onChange(preset)}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Sparkles size={12} />
            <span>{preset}</span>
          </button>
        ))}
      </div>
      <AgentCommandBar
        targetName={node?.displayName ?? null}
        value={value}
        pending={pending}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </section>
  );
}
