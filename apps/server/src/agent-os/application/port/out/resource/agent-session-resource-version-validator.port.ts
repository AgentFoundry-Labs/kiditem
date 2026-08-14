import type { CanonicalResourceRef } from '@kiditem/shared/agent-interaction';

export const AGENT_SESSION_RESOURCE_VERSION_VALIDATOR = Symbol(
  'AGENT_SESSION_RESOURCE_VERSION_VALIDATOR',
);

/**
 * Owner-domain composition validates the exact immutable resource versions
 * shown to an approver. The Agent OS default must fail closed for references
 * it cannot authoritatively resolve.
 */
export interface AgentSessionResourceVersionValidatorPort {
  areCurrent(input: {
    organizationId: string;
    actorId: string;
    resourceVersions: readonly CanonicalResourceRef[];
  }): Promise<boolean>;
}
