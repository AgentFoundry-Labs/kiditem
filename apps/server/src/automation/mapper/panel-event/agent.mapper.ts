import { PanelRunItem } from '@kiditem/shared/panel';
import type { PanelRunItem as PanelRunItemType } from '@kiditem/shared/panel';
import type { HeartbeatRun } from '@prisma/client';
import type { PanelRunMapper } from './types';

/**
 * Service layer가 HeartbeatRun + AgentDefinition 조인 결과를 이 shape으로 넘김.
 *
 * service 호출 예 (panel.service.ts):
 *   const run = await prisma.heartbeatRun.findFirst({
 *     where: { id, organizationId }, include: { agent: { select: { id: true, name: true } } }
 *   });
 *   const input: AgentAdapterInput = { run, agent: { id: run.agent.id, name: run.agent.name } };
 *   const item = agentPanelMapper.mapToItem(input, organizationId);
 */
export interface AgentAdapterInput {
  run: HeartbeatRun;
  agent: { id: string; name: string };
}

// shared Zod enum에서 유효 상태 집합을 파생 — 드리프트 시 tsc가 감지
const VALID_STATUS = new Set<PanelRunItemType['status']>(PanelRunItem.shape.status.options);

export const agentPanelMapper: PanelRunMapper<AgentAdapterInput> = {
  source: 'agent',
  mapToItem(input, _organizationId) {
    const { run, agent } = input;

    // ADR-0011 Rule 4: NO mapping table — pass-through only.
    // Drift guard: unknown status throws to catch writer regressions.
    if (!VALID_STATUS.has(run.status as PanelRunItemType['status'])) {
      throw new Error(
        `agentPanelMapper: unknown status "${run.status}" for HeartbeatRun ${run.id}. ` +
          `Expected one of: ${[...VALID_STATUS].join(', ')}`,
      );
    }

    return {
      id: `agent:${run.id}`,
      kind: 'run',
      source: 'agent',
      sourceId: run.id,
      status: run.status as PanelRunItemType['status'],
      failureType: run.failureType ?? null,
      phase: null, // agent source doesn't have phase (ADR-0011 Rule 2)
      title: agent.name,
      deepLink: `/agents/${agent.id}/runs/${run.id}`,
      actorUserId: run.triggeredByUserId ?? null,
      visibility: agentPanelMapper.defaultVisibility(input),
      createdAt: run.createdAt.toISOString(),
      ...(run.error != null ? { errorMessage: run.error } : {}),
    };
  },
  defaultVisibility(input) {
    return input.run.triggeredByUserId == null ? 'organization' : 'user';
  },
};
