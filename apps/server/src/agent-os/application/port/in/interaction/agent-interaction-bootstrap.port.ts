import type { InteractionBootstrap } from '@kiditem/shared/agent-interaction';

export interface InteractionPrincipalInput {
  organizationId: string;
  userId: string;
}

export const AGENT_INTERACTION_BOOTSTRAP_PORT = Symbol(
  'AGENT_INTERACTION_BOOTSTRAP_PORT',
);

export interface AgentInteractionBootstrapPort {
  bootstrap(input: InteractionPrincipalInput): Promise<InteractionBootstrap>;
}
