'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, PanelLeft, PanelRight, Radio } from 'lucide-react';
import type { AlertItem } from '@kiditem/shared/alerts';
import { cn, formatNumber } from '@/lib/utils';
import type { PipeConfirmChannel } from '@/hooks/use-confirm-report';
import type { CanvasInsets } from '../hooks/use-canvas-view';
import { buildPipeAgents } from '../lib/pipe-agents';
import { DIAGRAM_AGENT_BY_ID, DIAGRAM_NODES, type DiagramAgentId } from '../lib/pipe-diagram-layout';
import type { PipeSnapshot } from '@/lib/agent-org/pipe-model';
import type { PipeBusiness } from '@/lib/agent-org/types';
import { PipeBottomDashboard } from './PipeBottomDashboard';
import { PipeDiagram } from './PipeDiagram';
import {
  ACTIVITY_PANEL_WIDTH,
  AGENTS_PANEL_WIDTH,
  FOLDED_PANEL_WIDTH,
  PANEL_EDGE,
  PipeActivityPanel,
  PipeAgentsPanel,
} from './PipeSidePanels';
import { PipeStateChip } from './PipeStateChip';

const CONNECTION: Readonly<Record<string, { label: string; tone: string; dot: string }>> = {
  connected: { label: 'LIVE', tone: 'text-emerald-400', dot: 'bg-emerald-400 motion-safe:animate-pulse' },
  connecting: { label: '연결 중', tone: 'text-slate-400', dot: 'bg-slate-500' },
  disconnected: { label: '알림 확인 끊김', tone: 'text-red-400', dot: 'bg-red-400' },
};

const STAGE_BOX_COUNT = DIAGRAM_NODES.filter((node) => node.kind === 'stage').length;
/** 패널과 그림 사이에 남기는 틈. */
const PANEL_GAP = 12;

const NARROW_QUERY = '(max-width: 767px)';

function subscribeNarrow(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readNarrow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;
}

const TOOL_BUTTON =
  'flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#111827] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400';

/**
 * Agent Org 본문 — 옛 Agent OS 화면의 틀.
 *
 * 위에 제목 줄, 가운데 캔버스(파이프라인 그림) 위로 왼쪽 에이전트 목록 · 오른쪽 실시간 활동이
 * 떠 있고, 아래에 에이전트 막대 · 매출 · 광고 · 실시간 작업 대시보드가 있다. 데이터를 부르지
 * 않는다 — 판정이 끝난 스냅샷과 이미 읽은 숫자만 그린다.
 */
export function AgentOrgView({
  snapshot,
  connection,
  now,
  confirm,
  business,
  openAlerts = [],
}: {
  snapshot: PipeSnapshot;
  connection: string;
  now: number;
  /** 사장님 컨펌 텔레그램 보고. 없으면 텔레그램 칸이 확인 중으로 선다. */
  confirm?: PipeConfirmChannel;
  /** 이번 달 매출 · 광고. 없으면 '—'. */
  business?: PipeBusiness;
  /** 아직 열린 원천 실패 알림. */
  openAlerts?: readonly AlertItem[];
}) {
  const [selectedAgent, setSelectedAgent] = useState<DiagramAgentId | null>(null);
  const [agentsMinimized, setAgentsMinimized] = useState(false);
  const [activityMinimized, setActivityMinimized] = useState(false);
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);

  const agents = useMemo(() => buildPipeAgents(snapshot), [snapshot]);
  const live = CONNECTION[connection] ?? CONNECTION.connecting!;
  const { header, connectors } = snapshot;
  const selected = selectedAgent ? DIAGRAM_AGENT_BY_ID.get(selectedAgent) ?? null : null;

  const insets = useMemo<CanvasInsets>(() => {
    if (narrow) return { left: 0, right: 0, top: 0, bottom: 56 };
    const side = (minimized: boolean, width: number) => PANEL_EDGE + (minimized ? FOLDED_PANEL_WIDTH : width) + PANEL_GAP;
    return {
      left: side(agentsMinimized, AGENTS_PANEL_WIDTH),
      right: side(activityMinimized, ACTIVITY_PANEL_WIDTH),
      top: 0,
      bottom: 56,
    };
  }, [narrow, agentsMinimized, activityMinimized]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 pb-3 max-md:px-3">
        <div className="flex min-w-0 items-center gap-2">
          {selected ? (
            <button
              type="button"
              onClick={() => setSelectedAgent(null)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.04] hover:text-white"
              aria-label="전체 파이프라인 보기"
            >
              <ChevronLeft size={17} aria-hidden />
            </button>
          ) : null}
          {selected ? (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selected.color }} aria-hidden />
          ) : null}
          <h1 className="min-w-0 truncate text-[18px] font-bold max-md:text-[17px]">{selected?.label ?? 'Agent Org'}</h1>
          <span className={cn('ml-1 inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wide', live.tone)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', live.dot)} aria-hidden />
            {live.label}
          </span>
          {header.running > 0 ? (
            <span className="ml-1 flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              {formatNumber(header.running)} RUNNING
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="mr-1 flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="지금 상태">
            <PipeStateChip state="waiting_human" label="확인 필요" count={header.attention} />
            {header.failed > 0 ? <PipeStateChip state="failed" label="실패" count={header.failed} /> : null}
            {header.stale > 0 ? <PipeStateChip state="stale" label="오래됨" count={header.stale} /> : null}
            <span className="ml-1 text-slate-500">
              몰 연결 {connectors.total === null ? '데이터 없음' : `${formatNumber(connectors.total)}곳`}
            </span>
            {connectors.total !== null ? (
              <>
                <PipeStateChip state="done" label="정상" count={connectors.signedIn} />
                {connectors.needsLogin > 0 ? (
                  <span title={connectors.needsLoginNames.join(', ')}>
                    <PipeStateChip state="blocked_external" label="로그인 필요" count={connectors.needsLogin} />
                  </span>
                ) : null}
                {connectors.unknown > 0 ? <PipeStateChip state="unknown" label="확인 안 됨" count={connectors.unknown} /> : null}
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setAgentsMinimized((value) => !value)}
            aria-pressed={!agentsMinimized}
            aria-label="에이전트 목록"
            title={agentsMinimized ? '에이전트 목록 펼치기' : '에이전트 목록 접기'}
            className={cn(TOOL_BUTTON, 'max-md:hidden')}
          >
            <PanelLeft size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setActivityMinimized((value) => !value)}
            aria-pressed={!activityMinimized}
            aria-label="실시간 활동"
            title={activityMinimized ? '실시간 활동 펼치기' : '실시간 활동 접기'}
            className={cn(TOOL_BUTTON, 'max-md:hidden')}
          >
            <PanelRight size={15} aria-hidden />
          </button>
          <span className={cn(TOOL_BUTTON, 'cursor-default hover:bg-[#111827]')} title={`알림 확인 · ${live.label}`}>
            <Radio size={15} className={cn(connection === 'connected' && 'text-emerald-400')} aria-hidden />
          </span>
        </div>
      </div>

      <div className="relative mx-5 min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1321] max-md:mx-3 max-md:h-[520px] max-md:min-h-[520px] max-md:flex-none">
        <PipeDiagram
          snapshot={snapshot}
          connection={connection}
          now={now}
          confirm={confirm}
          insets={insets}
          selectedAgent={selectedAgent}
        />
        <PipeAgentsPanel
          agents={agents}
          selected={selectedAgent}
          minimized={agentsMinimized}
          onSelect={(id) => setSelectedAgent((current) => (current === id ? null : id))}
          onToggleMinimize={() => setAgentsMinimized((value) => !value)}
        />
        <PipeActivityPanel
          inbox={snapshot.inbox}
          feed={snapshot.feed}
          now={now}
          connection={connection}
          minimized={activityMinimized}
          onToggleMinimize={() => setActivityMinimized((value) => !value)}
        />
      </div>

      <PipeBottomDashboard
        agents={agents}
        stageCount={STAGE_BOX_COUNT}
        connection={connection}
        business={business}
        openAlerts={openAlerts}
        now={now}
      />
    </div>
  );
}
