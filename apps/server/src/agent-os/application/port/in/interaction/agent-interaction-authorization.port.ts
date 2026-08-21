import type {
  AgentConversationReplay,
  AguiConnectionAuthorization,
  AguiRunAuthorization,
} from '@kiditem/shared/agent-interaction';
import type { AgentExecutionName, AgentSessionName } from '@kiditem/shared/identifiers';
import type { InteractionPrincipalInput } from './agent-interaction-bootstrap.port';

export type { InteractionPrincipalInput } from './agent-interaction-bootstrap.port';
export interface AuthorizeRunInput { runIntent: string; copilotThreadId: string; aguiRunId: string; dashboardContext: unknown; userEvent: unknown }
export interface AuthorizeConnectionInput extends InteractionPrincipalInput { copilotThreadId: string; cursor?: string | null }
export interface AuthorizeCurrentRunInput extends InteractionPrincipalInput { agentDefinitionKey: string; copilotThreadId: string }
export interface AuthorizeLiveJoinInput { agentDefinitionKey: string; copilotThreadId: string; afterSequence: bigint; liveJoinToken: string }
export interface AuthorizedCurrentRun { session: AgentSessionName; execution: AgentExecutionName; aguiRunId: string }
export interface AuthorizedLiveJoin { organizationId: string; userId: string; sessionId: string; copilotThreadId: string; contextEpoch: number; afterSequence: bigint }
export interface AgentInteractionConnectionAuthorization { authorization: AguiConnectionAuthorization; replay: AgentConversationReplay; liveJoinToken: string | null; liveJoinExpiresAt: string | null }
export const AGENT_INTERACTION_AUTHORIZATION_PORT = Symbol('AGENT_INTERACTION_AUTHORIZATION_PORT');
export interface AgentInteractionAuthorizationPort {
  authorizeRun(input: AuthorizeRunInput): Promise<AguiRunAuthorization>;
  authorizeConnection(input: AuthorizeConnectionInput): Promise<AgentInteractionConnectionAuthorization>;
  authorizeCurrentRun(input: AuthorizeCurrentRunInput): Promise<AuthorizedCurrentRun | null>;
  authorizeLiveJoin(input: AuthorizeLiveJoinInput): Promise<AuthorizedLiveJoin>;
  health(): Promise<{ status: 'ok' }>;
}
