'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, History, Radio } from 'lucide-react';
// ⚠️ Agent Org 의 상태 모델을 그대로 읽는다. 대시보드가 에이전트 상태를 따로 계산하면 두
// 화면이 같은 에이전트를 두고 다른 말을 한다. 두 번째 소비자가 생겼으므로 이 모델은
// `src/lib` 으로 올리는 것이 맞다(app/CLAUDE.md) — 올리기 전까지는 여기서 직접 읽는다.
import { useAgentOrg } from '@/app/agent-org/hooks/use-agent-org';
import {
  PIPE_AGENT_HEALTH,
  buildPipeAgents,
  type PipeAgentHealth,
  type PipeAgentSummary,
} from '@/app/agent-org/lib/pipe-agents';
import type { DiagramAgentId } from '@/app/agent-org/lib/pipe-diagram-layout';
import type { PipeStageView } from '@/app/agent-org/lib/pipe-model';
import { PIPE_STATE_LABEL, worstPipeState, type PipeState } from '@/app/agent-org/lib/pipe-states';
import { cn, timeAgo } from '@/lib/utils';
import { DashboardCardHeader, DashboardHeaderLink } from './DashboardCardHeader';

/**
 * 에이전트 실시간 상태 — 지금 누가 무엇을 하고 있고, 무엇이 급한가.
 *
 * 읽기 전용 요약이다. 여기서 아무것도 실행하지 않는다 — 줄을 누르면 그 일을 소유한 화면으로
 * 간다(대시보드 가이드: 대시보드 전용 실행 핸들러나 범용 운영 패널을 만들지 않는다).
 *
 * 폴링(탭 하나 기준 최악): `useAgentOrg` 가 관찰 기록 · 몰 계정 · 셀피아 신선도 · 매출 기준 ·
 * 광고 기준을 60초마다(분당 5회), 사장님 컨펌 상태를 20초마다(분당 3회) 읽는다. 매출 · 광고
 * 기준은 대시보드가 같은 키로 이미 읽고 있어 합쳐지고, 알림은 앱 전역 쿼리를 함께 쓴다. 새로
 * 더해지는 것은 분당 약 6회다.
 */

/**
 * 상태마다 색 하나 — 신호등처럼 읽힌다. 돌고 있으면 초록(깜빡임), 사람이 봐야 하면 주황, 실패는
 * 빨강, 할 일 없이 대기면 회색, 기록이 아예 없으면 빈 동그라미. 에이전트 고유색이 아니라 의미색이다.
 */
function stateTone(state: PipeState): { dot: string; pulse: boolean } {
  switch (state) {
    case 'running':
    case 'queued':
    case 'retrying':
      return { dot: 'bg-emerald-500', pulse: true };
    case 'failed':
      return { dot: 'bg-red-500', pulse: false };
    case 'blocked_external':
    case 'waiting_human':
    case 'stale':
      return { dot: 'bg-amber-500', pulse: false };
    case 'done':
    case 'partial':
    case 'skipped':
    case 'rejected':
      return { dot: 'bg-slate-400', pulse: false };
    default:
      return { dot: 'bg-white ring-1 ring-inset ring-slate-300', pulse: false };
  }
}



/** 급한 것부터. 실패 → 막힘 → 대기 → 오래됨, 같으면 최근 것. */
const URGENCY: Readonly<Partial<Record<PipeState, number>>> = {
  failed: 0,
  blocked_external: 1,
  waiting_human: 2,
  stale: 3,
};

const INBOX_LIMIT = 6;
const FEED_LIMIT = 5;

const RUNNING: ReadonlySet<PipeState> = new Set(['running', 'queued', 'retrying']);

/**
 * 대시보드의 에이전트 — 사이드바와 같은 이름, 같은 순서(사장님 2026-09-18).
 *
 * Agent Org 는 에이전트를 더 잘게 나눈다(분석 · 주문 · 사장님 컨펌이 따로). 여기서는 사이드바
 * 묶음대로 합친다 — 시장 · 키워드 분석은 소싱 아래 있고, 주문수집은 쇼핑몰 아래 있다. 사장님
 * 컨펌은 에이전트가 아니라 관문이라 줄을 두지 않고, 그 일은 아래 긴급에 뜬다. 재무분석은 Agent
 * Org 에 아직 단계가 없어 셀 기록이 없다 — 없다고 적지 정상으로 칠하지 않는다.
 */
const DASHBOARD_AGENTS: ReadonlyArray<{ id: string; label: string; groups: readonly DiagramAgentId[] }> = [
  { id: 'sourcing', label: '소싱', groups: ['analysis', 'sourcing'] },
  { id: 'product', label: '상품', groups: ['product'] },
  { id: 'mall', label: '쇼핑몰', groups: ['mall', 'order'] },
  { id: 'inventory', label: '재고관리', groups: ['inventory'] },
  { id: 'marketing', label: '마케팅', groups: ['marketing'] },
  { id: 'cs', label: 'CS', groups: ['cs'] },
  { id: 'finance', label: '재무분석', groups: [] },
];

interface AgentLine {
  id: string;
  label: string;
  stageIds: string[];
  state: PipeState;
  health: PipeAgentHealth;
  reason: string | null;
  attention: number;
}

/** 묶인 에이전트들을 한 줄로. 상태는 가장 급한 것, 이유는 그 상태를 낸 쪽의 것, 확인 수는 합. */
function mergeAgents(label: string, id: string, parts: readonly PipeAgentSummary[]): AgentLine {
  const state = worstPipeState(parts.map((part) => part.state)) ?? 'unknown';
  const reasonSource = parts.find((part) => part.state === state && part.reason) ?? null;
  return {
    id,
    label,
    stageIds: parts.flatMap((part) => part.stageIds),
    state,
    health: PIPE_AGENT_HEALTH[state],
    reason: reasonSource?.reason ?? null,
    attention: parts.reduce((sum, part) => sum + part.attention, 0),
  };
}

/**
 * 이 에이전트가 지금 하고 있는 일 한 줄.
 *
 * 돌고 있는 단계가 있으면 그 단계 이름이다. 막혀 있으면 막힌 이유다 — 그게 지금 그 에이전트에게
 * 일어나고 있는 일이다. 할 일이 없으면 대기, 셀 기록이 아예 없으면 그렇다고 적는다(정상으로
 * 칠하지 않는다).
 */
function currentWork(agent: AgentLine, views: ReadonlyMap<string, PipeStageView>): string {
  const running = agent.stageIds
    .map((id) => views.get(id))
    .filter((view): view is PipeStageView => view !== undefined && RUNNING.has(view.state));
  if (running.length > 0) return `${running.map((view) => view.def.title).join(' · ')} 진행 중`;
  if (agent.health === 'attention') return agent.reason ?? PIPE_STATE_LABEL[agent.state];
  if (agent.health === 'ok') return '대기 중';
  return '기록 없음';
}

function StatusDot({ dot, pulse }: { dot: string; pulse: boolean }) {
  return (
    <span className="relative flex h-2 w-2 flex-none" aria-hidden>
      {pulse ? (
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none', dot)} />
      ) : null}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', dot)} />
    </span>
  );
}

/** 모든 줄이 같은 높이 — 이름 · 지금 하는 일 · 확인 필요 수가 늘 같은 자리에 선다. */
const ROW_GRID = 'grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3';

function AgentRow({ agent, work }: { agent: AgentLine; work: string }) {
  const tone = stateTone(agent.state);
  return (
    <li className={cn(ROW_GRID, 'h-11')}>
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
        {/* 얼굴은 AI 로 만든 가상 인물이다(사장님 2026-09-20) — `public/agents/<id>.png`. */}
        <span className="relative flex h-6 w-6 flex-none" aria-hidden>
          <img
            src={`/agents/${agent.id}.png`}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 rounded-full object-cover ring-1 ring-inset ring-violet-100"
          />
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-px">
            <StatusDot dot={tone.dot} pulse={tone.pulse} />
          </span>
        </span>
        {agent.label}
      </span>
      <span className={cn('line-clamp-2 text-[11px] leading-[1.3]', tone.pulse ? 'font-medium text-emerald-700' : 'text-slate-600')} title={work}>
        {work}
      </span>
      {agent.attention > 0 ? (
        <span
          className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold tabular-nums text-white"
          title={`사람이 확인해야 할 일 ${agent.attention}건 — 옆 '지금 해야 할 일'에서 바로 처리합니다`}
        >
          {agent.attention}
        </span>
      ) : <span aria-hidden />}
    </li>
  );
}

/** 세 장을 페이지에 넘긴다 — 페이지가 줄마다 왼쪽 칸과 짝지어 아래 선을 맞춘다. */
export type DashboardAgentStatusParts = { agents: ReactNode; recent: ReactNode };

export function DashboardAgentStatus({ children }: { children: (parts: DashboardAgentStatusParts) => ReactNode }) {
  const { snapshot, now } = useAgentOrg();
  const agents = useMemo(() => {
    const byGroup = new Map(buildPipeAgents(snapshot).map((agent) => [agent.group.id, agent]));
    return DASHBOARD_AGENTS.map((agent) => mergeAgents(
      agent.label,
      agent.id,
      agent.groups.flatMap((group) => {
        const found = byGroup.get(group);
        return found ? [found] : [];
      }),
    ));
  }, [snapshot]);
  const views = useMemo(
    () => new Map(snapshot.stages.map((view) => [view.def.id as string, view])),
    [snapshot.stages],
  );

  const urgent = useMemo(
    () => [...snapshot.inbox]
      .sort((a, b) => (URGENCY[a.state] ?? 9) - (URGENCY[b.state] ?? 9) || b.lastAt - a.lastAt)
      .slice(0, INBOX_LIMIT),
    [snapshot.inbox],
  );
  const feed = useMemo(() => snapshot.feed.slice(0, FEED_LIMIT), [snapshot.feed]);
  const nowDate = new Date(now);

  const agentsCard = (
      <section aria-label="에이전트 실시간 상태" className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]" data-testid="dashboard-agent-status">
        <DashboardCardHeader icon={Radio} tone="violet" title="LIVE ACTIVITY" />

        <ul className="divide-y divide-slate-100 pb-2" aria-label="에이전트마다 지금 진행 중인 일">
          {agents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} work={currentWork(agent, views)} />
          ))}
        </ul>
      </section>
  );
  // 방금 한 일. 에이전트가 무엇을 하고 있는지의 나머지 절반이다.
  const recentCard = feed.length > 0 ? (
        <section className="flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <DashboardCardHeader icon={History} tone="slate" title="방금" />
          <ul className="divide-y divide-slate-100">
            {feed.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 truncate text-xs text-slate-600" title={entry.title}>
                  {entry.laneLabel ? <span className="mr-1 font-medium text-slate-800">{entry.laneLabel}</span> : null}
                  {entry.title}
                </span>
                <span className="flex-none text-[11px] text-slate-400">{timeAgo(new Date(entry.at), nowDate)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null;

  return <>{children({ agents: agentsCard, recent: recentCard })}</>;
}
