import {
  DIAGRAM_AGENT_GROUPS,
  type DiagramAgentGroup,
} from './pipe-diagram-layout';
import { buildAgentOrgStatuses, type AgentOrgAgentStatus, type PipeAgentHealth } from '@/lib/agent-org/agent-status';
import type { PipeSnapshot } from '@/lib/agent-org/pipe-model';
import type { PipeStageId } from '@/lib/agent-org/pipe-stages';
import type { PipeState } from '@/lib/agent-org/pipe-states';

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
  const groups = new Map(DIAGRAM_AGENT_GROUPS.map((group) => [group.id, group]));
  return buildAgentOrgStatuses(snapshot).map((status: AgentOrgAgentStatus) => ({
    ...status,
    group: groups.get(status.id)!,
  }));
}

export function countAgentHealth(agents: readonly PipeAgentSummary[]): Record<PipeAgentHealth, number> {
  const counts: Record<PipeAgentHealth, number> = { working: 0, attention: 0, ok: 0, unknown: 0 };
  for (const agent of agents) counts[agent.health] += 1;
  return counts;
}
