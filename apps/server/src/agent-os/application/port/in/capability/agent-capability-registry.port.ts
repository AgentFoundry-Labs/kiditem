import type { AgentCapabilityHandler } from '../../out/capability/agent-capability-handler.port';

export const AGENT_CAPABILITY_REGISTRY_PORT = Symbol('AGENT_CAPABILITY_REGISTRY_PORT');

export interface AgentCapabilityRegistryPort {
  register(handler: AgentCapabilityHandler): void;
  resolve(key: string): AgentCapabilityHandler | null;
}
