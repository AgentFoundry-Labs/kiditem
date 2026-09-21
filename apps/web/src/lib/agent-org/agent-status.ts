import { mergeStageViews, type PipeSnapshot, type PipeStageView } from './pipe-model';
import type { PipeStageId } from './pipe-stages';
import { worstPipeState, type PipeState } from './pipe-states';

/** Agent Org's stable groups. Visual layout details stay with the Agent Org route. */
export type AgentOrgAgentId =
  | 'analysis'
  | 'sourcing'
  | 'owner'
  | 'product'
  | 'marketing'
  | 'mall'
  | 'order'
  | 'inventory'
  | 'cs';

/** The operational stages owned by each group, independent of the diagram layout. */
export const PIPE_AGENT_STAGE_GROUPS: readonly { id: AgentOrgAgentId; stageIds: readonly PipeStageId[] }[] = [
  { id: 'analysis', stageIds: ['keyword', 'sns', 'rising', 'competitor'] },
  { id: 'sourcing', stageIds: ['candidates', 'supplier', 'shortlist'] },
  { id: 'owner', stageIds: ['gate'] },
  { id: 'product', stageIds: ['register', 'content'] },
  { id: 'marketing', stageIds: ['reels', 'blog', 'ads'] },
  { id: 'mall', stageIds: ['malls'] },
  { id: 'order', stageIds: ['orders'] },
  { id: 'inventory', stageIds: ['inventory'] },
  { id: 'cs', stageIds: ['cs'] },
];

/** The shared health vocabulary used by Agent Org and the dashboard status rail. */
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

export interface AgentOrgAgentStatus {
  id: AgentOrgAgentId;
  stageIds: PipeStageId[];
  state: PipeState;
  health: PipeAgentHealth;
  reason: string | null;
  /** Number of inbox items attached to this agent's stages. */
  attention: number;
}

/**
 * Builds the shared operational status model without importing Agent Org's visual layout.
 * Unknown stages remain unknown and mall login blocks retain their higher priority.
 */
export function buildAgentOrgStatuses(snapshot: PipeSnapshot): AgentOrgAgentStatus[] {
  const views = new Map(snapshot.stages.map((view) => [view.def.id, view]));
  return PIPE_AGENT_STAGE_GROUPS.map(({ id, stageIds: configuredStageIds }) => {
    const stageIds = [...configuredStageIds];
    const parts = stageIds
      .map((stageId) => views.get(stageId))
      .filter((view): view is PipeStageView => view !== undefined);
    const merged = parts.length > 0 ? mergeStageViews(parts as [PipeStageView, ...PipeStageView[]]) : null;

    let state: PipeState = merged?.state ?? 'unknown';
    let reason = merged?.reason ?? null;
    if (id === 'mall' && snapshot.connectors.needsLogin > 0) {
      const worst = worstPipeState([state, 'blocked_external']) ?? state;
      if (worst !== state) {
        state = worst;
        reason = `로그인이 필요한 몰 ${snapshot.connectors.needsLogin}곳`;
      }
    }

    return {
      id,
      stageIds,
      state,
      health: PIPE_AGENT_HEALTH[state],
      reason,
      attention: snapshot.inbox.filter((item) => item.stageIds.some((stageId) => stageIds.includes(stageId))).length,
    };
  });
}
