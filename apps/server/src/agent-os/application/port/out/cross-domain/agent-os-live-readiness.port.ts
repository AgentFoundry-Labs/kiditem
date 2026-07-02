import type { AgentOsLiveReadinessResponse } from '@kiditem/shared/agent-os';

export const AGENT_OS_LIVE_READINESS_PORT = Symbol(
  'AGENT_OS_LIVE_READINESS_PORT',
);

export interface AgentOsLiveReadinessPort {
  getAgentOsLiveStatus(
    organizationId: string,
  ): Promise<AgentOsLiveReadinessResponse>;
}
