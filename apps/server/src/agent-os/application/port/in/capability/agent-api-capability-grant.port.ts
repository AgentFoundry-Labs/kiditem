export const AGENT_API_CAPABILITY_GRANT_PORT = Symbol('AGENT_API_CAPABILITY_GRANT_PORT');

export const AGENT_API_COLLECTION_CAPABILITY = 'sourcing.refreshCollection' as const;
export const AGENT_API_SHADOW_COLLECTION_CAPABILITY =
  'sourcing.collect_shadow_signals' as const;
export const AGENT_API_CAPABILITY = AGENT_API_COLLECTION_CAPABILITY;
export const AGENT_API_CAPABILITIES = [
  AGENT_API_COLLECTION_CAPABILITY,
  AGENT_API_SHADOW_COLLECTION_CAPABILITY,
] as const;
export type AgentApiCapability = (typeof AGENT_API_CAPABILITIES)[number];

export interface AgentApiCapabilityPrincipal {
  organizationId: string;
  requestId: string;
  runId: string;
  agentInstanceId: string;
  requestedByUserId: string | null;
}

export interface AgentApiCapabilityGrantPort {
  verifyAndAuthorize(input: {
    token: string;
    capability: AgentApiCapability;
    now?: Date;
  }): Promise<AgentApiCapabilityPrincipal>;
}
