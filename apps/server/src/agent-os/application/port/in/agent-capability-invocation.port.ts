import type {
  AgentExecutionName,
  AgentSessionName,
  AgentSessionTaskName,
} from '@kiditem/shared/identifiers';
import type { AgentCapabilityExecutionResult } from '../out/capability/agent-capability-handler.port';

export const AGENT_SESSION_CAPABILITY_INVOCATION_PORT = Symbol(
  'AGENT_SESSION_CAPABILITY_INVOCATION_PORT',
);

/**
 * The only Agent-facing capability command. Resource names keep this boundary
 * unambiguous across transports; adapters parse them before entering storage.
 */
export interface AgentSessionCapabilityInvocationInput {
  session: AgentSessionName;
  task: AgentSessionTaskName;
  execution: AgentExecutionName;
  capabilityKey: string;
  input: Record<string, unknown>;
}

export interface AgentSessionCapabilityInvocationPort {
  invoke(
    input: AgentSessionCapabilityInvocationInput,
  ): Promise<AgentCapabilityExecutionResult>;
}
