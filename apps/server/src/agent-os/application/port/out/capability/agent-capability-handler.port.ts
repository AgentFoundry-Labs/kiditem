import type { AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import type { CapabilityExecutionContext } from '../../../../../common/capability-composition';

/** Final narrow handler contract; capability metadata belongs to CapabilityDefinition. */
export interface AgentCapabilityContractHandler {
  capabilityKey: string;
  invoke(input: {
    context: CapabilityExecutionContext;
    input: Record<string, unknown>;
  }): Promise<AgentResultEnvelope>;
}
