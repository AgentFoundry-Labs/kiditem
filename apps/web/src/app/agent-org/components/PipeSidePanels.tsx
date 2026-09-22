'use client';

import { ChevronLeft, ChevronRight, Minus, Radio, Users } from 'lucide-react';
import AgentFace from '@/components/AgentFace';
import { cn, formatNumber } from '@/lib/utils';
import type { PipeAgentSummary } from '../lib/pipe-agents';
import type { DiagramAgentId } from '../lib/pipe-diagram-layout';
import type { PipeFeedEntry, PipeInboxItem } from '@/lib/agent-org/pipe-model';
import { AttentionInbox, PipeFeed } from './PipeRail';
import { PipeStateChip } from './PipeStateChip';

/** 펼친 패널 폭과 가장자리 여백. 캔버스가 그림을 맞출 때 이만큼 비켜 둔다. */
export const AGENTS_PANEL_WIDTH = 300;
export const ACTIVITY_PANEL_WIDTH = 320;
export const FOLDED_PANEL_WIDTH = 44;
export const PANEL_EDGE = 16;

const SHELL =
  'absolute top-4 z-20 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f1628]/95 shadow-xl shadow-black/40 backdrop-blur-xl';
const FOLDED =
  'group absolute top-4 z-20 flex w-11 flex-col items-center justify-between rounded-2xl border border-white/10 bg-[#0f1628]/95 py-3 shadow-xl shadow-black/40 backdrop-blur-xl transition-colors hover:bg-[#0f1628] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400';

/** 왼쪽 — 에이전트 목록. 고르면 캔버스가 그 에이전트 묶음으로 간다. */
export function PipeAgentsPanel({
  agents,
  selected,
  minimized,
  onSelect,
  onToggleMinimize,
}: {
  agents: readonly PipeAgentSummary[];
  selected: DiagramAgentId | null;
  minimized: boolean;
  onSelect: (id: DiagramAgentId) => void;
  onToggleMinimize: () => void;
}) {
  const attention = agents.reduce((sum, agent) => sum + agent.attention, 0);

  if (minimized) {
    return (
      <button type="button" onClick={onToggleMinimize} className={cn(FOLDED, 'left-4 h-[200px]')} aria-label="에이전트 목록 펼치기">
        <Users size={14} className="text-slate-400 transition-colors group-hover:text-white" aria-hidden />
        <span className="text-[11px] font-bold tracking-widest text-slate-300" style={{ writingMode: 'vertical-rl' }}>
          AGENTS · {agents.length}
        </span>
        <ChevronRight size={14} className="text-slate-500 transition-colors group-hover:text-white" aria-hidden />
      </button>
    );
  }

  return (
    <section
      aria-label="에이전트 목록"
      className={cn(SHELL, 'left-4 max-h-[calc(100%-32px)] max-md:hidden')}
      style={{ width: AGENTS_PANEL_WIDTH }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <h2 className="text-[14px] font-bold">Agents</h2>
          <p className="text-[10px] text-slate-500">
            에이전트 {formatNumber(agents.length)} · 확인 필요 {formatNumber(attention)}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleMinimize}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.04] hover:text-white"
          aria-label="에이전트 목록 접기"
        >
          <Minus size={13} aria-hidden />
        </button>
      </header>
      <ul className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {agents.map((agent) => {
          const { group } = agent;
          const isSelected = selected === group.id;
          return (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => onSelect(group.id)}
                aria-pressed={isSelected}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
                  isSelected ? 'bg-white/[0.06]' : 'border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.04]',
                )}
                style={isSelected ? { borderColor: `${group.color}80`, boxShadow: `0 0 0 1px ${group.color}40` } : undefined}
              >
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl" style={{ background: `${group.color}1f` }}>
                  <AgentFace color={group.face.color} role={group.face.role} size={44} />
                  <span className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: group.color }} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold">{group.label}</span>
                    {agent.attention > 0 ? (
                      <span
                        className="shrink-0 rounded-full bg-violet-500/20 px-1.5 text-[9.5px] font-semibold tabular-nums text-violet-200"
                        title={`확인 필요 ${agent.attention}건`}
                      >
                        {agent.attention}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500" title={agent.reason ?? group.summary}>
                    {group.summary}
                  </span>
                </span>
                <PipeStateChip state={agent.state} className="shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const CONNECTION_CHIP: Readonly<Record<string, { label: string; tone: string }>> = {
  connected: { label: 'LIVE', tone: 'bg-emerald-500/15 text-emerald-400' },
  connecting: { label: '연결 중', tone: 'bg-slate-500/15 text-slate-400' },
  disconnected: { label: 'OFFLINE', tone: 'bg-red-500/15 text-red-400' },
};

/** 오른쪽 — 실시간 활동: 확인 필요와 실시간 기록. */
export function PipeActivityPanel({
  inbox,
  feed,
  now,
  connection,
  minimized,
  onToggleMinimize,
}: {
  inbox: PipeInboxItem[];
  feed: PipeFeedEntry[];
  now: number;
  connection: string;
  minimized: boolean;
  onToggleMinimize: () => void;
}) {
  const chip = CONNECTION_CHIP[connection] ?? CONNECTION_CHIP.connecting!;
  const live = connection === 'connected';

  if (minimized) {
    return (
      <button type="button" onClick={onToggleMinimize} className={cn(FOLDED, 'right-4 h-[220px]')} aria-label="실시간 활동 펼치기">
        <span className="relative">
          <Radio size={14} className={cn(live ? 'text-emerald-400' : 'text-slate-400')} aria-hidden />
          {inbox.length > 0 ? <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-violet-400" aria-hidden /> : null}
        </span>
        <span className="text-[11px] font-bold tracking-widest text-slate-300" style={{ writingMode: 'vertical-rl' }}>
          LIVE · {inbox.length}
        </span>
        <ChevronLeft size={14} className="text-slate-500 transition-colors group-hover:text-white" aria-hidden />
      </button>
    );
  }

  return (
    <section
      aria-label="실시간 활동"
      className={cn(SHELL, 'right-4 max-h-[calc(100%-32px)] max-md:hidden')}
      style={{ width: ACTIVITY_PANEL_WIDTH }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio size={13} className={cn(live ? 'text-emerald-400' : 'text-slate-500')} aria-hidden />
          <h2 className="text-[14px] font-bold">Live Activity</h2>
          <span className={cn('rounded-md px-1.5 py-0.5 text-[9px] font-semibold', chip.tone)}>{chip.label}</span>
        </div>
        <button
          type="button"
          onClick={onToggleMinimize}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.04] hover:text-white"
          aria-label="실시간 활동 접기"
        >
          <Minus size={13} aria-hidden />
        </button>
      </header>
      <div className="flex-1 divide-y divide-white/5 overflow-y-auto">
        <AttentionInbox items={inbox} now={now} />
        <PipeFeed entries={feed} />
      </div>
    </section>
  );
}
