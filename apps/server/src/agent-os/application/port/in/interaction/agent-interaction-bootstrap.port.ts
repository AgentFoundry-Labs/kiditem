import type { AguiRunIntent, InteractionBootstrap } from '@kiditem/shared/agent-interaction';

export interface InteractionPrincipalInput {
  organizationId: string;
  userId: string;
}

export interface PrepareRunIntentInput extends InteractionPrincipalInput {
  agentDefinitionKey: string;
  copilotThreadId: string;
  aguiRunId: string;
  dashboardContext: unknown;
  userEvent: unknown;
}

export const AGENT_INTERACTION_BOOTSTRAP_PORT = Symbol(
  'AGENT_INTERACTION_BOOTSTRAP_PORT',
);

export interface AgentInteractionBootstrapPort {
  bootstrap(input: InteractionPrincipalInput): Promise<InteractionBootstrap>;
  prepareRunIntent(input: PrepareRunIntentInput): Promise<AguiRunIntent>;
}
