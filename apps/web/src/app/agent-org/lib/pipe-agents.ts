import {
  DIAGRAM_AGENT_GROUPS,
  DIAGRAM_NODES,
  type DiagramAgentGroup,
} from './pipe-diagram-layout';
import { mergeStageViews, type PipeSnapshot, type PipeStageView } from './pipe-model';
import type { PipeStageId } from './pipe-stages';
import { worstPipeState, type PipeState } from './pipe-states';

/** 에이전트 목록 · 하단 막대가 쓰는 네 갈래. 상태 열두 개를 사람이 한눈에 세는 크기로 줄인다. */
export type PipeAgentHealth = 'working' | 'attention' | 'ok' | 'unknown';

export const PIPE_AGENT_HEALTH: Readonly<Record<PipeState, PipeAgentHealth>> = {
  running: 'working',
  queued: 'working',
  retrying: 'working',
  waiting_human: 'attention',
  blocked_external: 'attention',
  failed: 'attention',
  stale: 'attention',
  done: 'ok',
  partial: 'ok',
  skipped: 'ok',
  rejected: 'ok',
  unknown: 'unknown',
};

export interface PipeAgentSummary {
  group: DiagramAgentGroup;
  stageIds: PipeStageId[];
  state: PipeState;
  health: PipeAgentHealth;
  reason: string | null;
  /** 이 에이전트의 단계에 걸린 확인 필요 수. */
  attention: number;
}

/**
 * 다이어그램의 에이전트 묶음마다 지금 상태 하나.
 *
 * 맡은 단계들의 상태를 박스와 같은 규칙(`mergeStageViews`)으로 합친다. 쇼핑몰 에이전트는 몰
 * 로그인도 제 일이라, 로그인이 필요한 몰이 있으면 그것까지 본다. 셀 곳이 없는 에이전트는
 * 모름이다 — 정상으로 칠하지 않는다.
 */
export function buildPipeAgents(snapshot: PipeSnapshot): PipeAgentSummary[] {
  const views = new Map(snapshot.stages.map((view) => [view.def.id, view]));
  return DIAGRAM_AGENT_GROUPS.map((group) => {
    const stageIds = DIAGRAM_NODES.flatMap((node) =>
      node.agent === group.id && node.kind === 'stage' ? [...node.stageIds] : [],
    );
    const parts = stageIds.map((id) => views.get(id)).filter((view): view is PipeStageView => view !== undefined);
    const merged = parts.length > 0 ? mergeStageViews(parts as [PipeStageView, ...PipeStageView[]]) : null;

    let state: PipeState = merged?.state ?? 'unknown';
    let reason = merged?.reason ?? null;
    if (group.id === 'mall' && snapshot.connectors.needsLogin > 0) {
      const worst = worstPipeState([state, 'blocked_external']) ?? state;
      if (worst !== state) {
        state = worst;
        reason = `로그인이 필요한 몰 ${snapshot.connectors.needsLogin}곳`;
      }
    }

    return {
      group,
      stageIds,
      state,
      health: PIPE_AGENT_HEALTH[state],
      reason,
      attention: snapshot.inbox.filter((item) => item.stageIds.some((id) => stageIds.includes(id))).length,
    };
  });
}

export function countAgentHealth(agents: readonly PipeAgentSummary[]): Record<PipeAgentHealth, number> {
  const counts: Record<PipeAgentHealth, number> = { working: 0, attention: 0, ok: 0, unknown: 0 };
  for (const agent of agents) counts[agent.health] += 1;
  return counts;
}
