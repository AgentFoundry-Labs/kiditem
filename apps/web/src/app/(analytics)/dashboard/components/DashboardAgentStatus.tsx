'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Radio } from 'lucide-react';
// ⚠️ Agent Org 의 상태 모델을 그대로 읽는다. 대시보드가 에이전트 상태를 따로 계산하면 두
// 화면이 같은 에이전트를 두고 다른 말을 한다. 두 번째 소비자가 생겼으므로 이 모델은
// `src/lib` 으로 올리는 것이 맞다(app/CLAUDE.md) — 올리기 전까지는 여기서 직접 읽는다.
import { useAgentOrg } from '@/app/agent-org/hooks/use-agent-org';
import { buildPipeAgents, countAgentHealth, type PipeAgentSummary } from '@/app/agent-org/lib/pipe-agents';
import { PIPE_STATE_LABEL, type PipeState } from '@/app/agent-org/lib/pipe-states';
import { cn, timeAgo } from '@/lib/utils';

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

/** 상태마다 색 하나. 에이전트 고유색이 아니라 의미색이다 — 고유색은 Agent Org 의 어두운 판용이다. */
function stateTone(state: PipeState): { dot: string; text: string; pulse: boolean } {
  switch (state) {
    case 'running':
    case 'queued':
    case 'retrying':
      return { dot: 'bg-violet-500', text: 'text-violet-700', pulse: true };
    case 'failed':
      return { dot: 'bg-red-500', text: 'text-red-600', pulse: false };
    case 'blocked_external':
    case 'waiting_human':
    case 'stale':
      return { dot: 'bg-amber-500', text: 'text-amber-700', pulse: false };
    case 'done':
    case 'partial':
    case 'skipped':
    case 'rejected':
      return { dot: 'bg-emerald-500', text: 'text-emerald-700', pulse: false };
    default:
      return { dot: 'bg-slate-300', text: 'text-slate-400', pulse: false };
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

function AgentRow({ agent }: { agent: PipeAgentSummary }) {
  const tone = stateTone(agent.state);
  const Icon = agent.group.icon;
  return (
    <li className="flex items-start gap-2.5 px-4 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-slate-100 text-slate-600">
        <Icon size={14} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-slate-800">{agent.group.label}</span>
          <span className={cn('inline-flex flex-none items-center gap-1 text-[11px] font-medium', tone.text)}>
            <span className="relative flex h-1.5 w-1.5">
              {tone.pulse ? (
                <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none', tone.dot)} />
              ) : null}
              <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', tone.dot)} />
            </span>
            {PIPE_STATE_LABEL[agent.state]}
          </span>
        </div>
        {/* 이유가 있으면 이유를, 없으면 이 에이전트가 맡은 일을 적는다. */}
        <p className="mt-0.5 truncate text-xs text-slate-500" title={agent.reason ?? agent.group.summary}>
          {agent.reason ?? agent.group.summary}
          {agent.attention > 0 ? (
            <span className="ml-1.5 rounded bg-amber-50 px-1 font-semibold text-amber-700">확인 {agent.attention}</span>
          ) : null}
        </p>
      </div>
    </li>
  );
}

export function DashboardAgentStatus() {
  const { snapshot, now } = useAgentOrg();
  const agents = useMemo(() => buildPipeAgents(snapshot), [snapshot]);
  const health = useMemo(() => countAgentHealth(agents), [agents]);

  const urgent = useMemo(
    () => [...snapshot.inbox]
      .sort((a, b) => (URGENCY[a.state] ?? 9) - (URGENCY[b.state] ?? 9) || b.lastAt - a.lastAt)
      .slice(0, INBOX_LIMIT),
    [snapshot.inbox],
  );
  const feed = useMemo(() => snapshot.feed.slice(0, FEED_LIMIT), [snapshot.feed]);
  const nowDate = new Date(now);

  return (
    <aside aria-label="에이전트 실시간 상태" className="space-y-3" data-testid="dashboard-agent-status">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Radio size={14} className="text-violet-600" aria-hidden />
            에이전트 실시간
          </h2>
          <Link
            href="/agent-org"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 transition-colors hover:text-violet-700"
          >
            Agent Org
            <ArrowUpRight size={12} aria-hidden />
          </Link>
        </header>

        {/* 한눈에 세는 네 갈래. 모름은 정상으로 세지 않는다. */}
        <dl className="grid grid-cols-4 gap-px border-b border-slate-100 bg-slate-100 text-center">
          {([
            ['working', '작업 중', 'text-violet-700'],
            ['attention', '확인 필요', 'text-amber-700'],
            ['ok', '정상', 'text-emerald-700'],
            ['unknown', '모름', 'text-slate-400'],
          ] as const).map(([key, label, color]) => (
            <div key={key} className="bg-white px-1 py-2">
              <dd className={cn('text-lg font-bold tabular-nums leading-tight', color)}>{health[key]}</dd>
              <dt className="text-[11px] text-slate-500">{label}</dt>
            </div>
          ))}
        </dl>

        <ul className="divide-y divide-slate-100">
          {agents.map((agent) => <AgentRow key={agent.group.id} agent={agent} />)}
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <AlertTriangle size={14} className="text-red-500" aria-hidden />
            긴급
          </h2>
          <span className="text-xs tabular-nums text-slate-400">{snapshot.inbox.length}건</span>
        </header>
        {urgent.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-400">지금 손이 필요한 일이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {urgent.map((item) => {
              const tone = stateTone(item.state);
              return (
                <li key={item.key}>
                  <Link href={item.href} className="block px-4 py-2.5 transition-colors hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn('h-1.5 w-1.5 flex-none rounded-full', tone.dot)} />
                        <span className="truncate text-[13px] font-medium text-slate-800">{item.title}</span>
                        {item.count > 1 ? (
                          <span className="flex-none text-[11px] tabular-nums text-slate-400">×{item.count}</span>
                        ) : null}
                      </span>
                      <span className="flex-none text-[11px] text-slate-400">
                        {item.lastAt > 0 ? timeAgo(new Date(item.lastAt), nowDate) : ''}
                      </span>
                    </div>
                    {item.detail ? (
                      <p className="mt-0.5 truncate pl-3 text-xs text-slate-500" title={item.detail}>{item.detail}</p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {snapshot.inbox.length > urgent.length ? (
          <Link
            href="/agent-org"
            className="block border-t border-slate-100 px-4 py-2 text-center text-xs font-medium text-slate-500 hover:text-violet-700"
          >
            {snapshot.inbox.length - urgent.length}건 더 보기
          </Link>
        ) : null}
      </section>

      {/* 방금 한 일. 에이전트가 무엇을 하고 있는지의 나머지 절반이다. */}
      {feed.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-800">방금</h2>
          </header>
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
      ) : null}
    </aside>
  );
}
