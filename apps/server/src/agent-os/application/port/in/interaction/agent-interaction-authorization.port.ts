import type {
  AgentConversationReplay,
  AguiConnectionAuthorization,
  AguiRunAuthorization,
} from "@kiditem/shared/agent-interaction";
import type { AgentExecutionName, AgentSessionName } from "@kiditem/shared/identifiers";

export interface AuthorizeRunInput {
  organizationId: string;
  userId: string;
  agentDefinitionKey: string;
  copilotThreadId: string;
  aguiRunId: string;
  dashboardContext: unknown;
  userEvent: unknown;
}
export interface AuthorizeConnectionInput {
  organizationId: string;
  userId: string;
  agentDefinitionKey: string;
  copilotThreadId: string;
  afterSequence?: string | null;
}
export interface AuthorizeCurrentRunInput {
  organizationId: string;
  userId: string;
  agentDefinitionKey: string;
  copilotThreadId: string;
}
export interface AuthorizedCurrentRun {
  session: AgentSessionName;
  execution: AgentExecutionName;
  aguiRunId: string;
  attemptId: string;
  startIntentId: string;
}
/** Internal exact coordinate created only after current principal/session revalidation. */
export interface AuthorizedLiveJoin {
  organizationId: string;
  userId: string;
  sessionId: string;
  copilotThreadId: string;
  contextEpoch: number;
  afterSequence: bigint;
}
export interface AgentInteractionConnectionAuthorization {
  authorization: AguiConnectionAuthorization;
  replay: AgentConversationReplay;
  liveCoordinate: AuthorizedLiveJoin | null;
}
export const AGENT_INTERACTION_AUTHORIZATION_PORT = Symbol("AGENT_INTERACTION_AUTHORIZATION_PORT");
export interface AgentInteractionAuthorizationPort {
  authorizeRun(input: AuthorizeRunInput): Promise<AguiRunAuthorization>;
  authorizeConnection(input: AuthorizeConnectionInput): Promise<AgentInteractionConnectionAuthorization>;
  authorizeCurrentRun(input: AuthorizeCurrentRunInput): Promise<AuthorizedCurrentRun | null>;
  health(): Promise<{ status: "ok" }>;
}
