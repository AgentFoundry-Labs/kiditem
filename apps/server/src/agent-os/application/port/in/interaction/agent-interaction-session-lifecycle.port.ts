import type {
  AgentSessionLifecycleCommand,
  AgentSessionLifecycleCommandKind,
} from "@kiditem/shared/agent-interaction";

export const AGENT_INTERACTION_SESSION_LIFECYCLE_PORT = Symbol(
  "AGENT_INTERACTION_SESSION_LIFECYCLE_PORT",
);

export interface AgentInteractionSessionLifecycleInput
  extends AgentSessionLifecycleCommand {
  organizationId: string;
  actorId: string;
}

export interface AgentInteractionSessionLifecycleResult {
  command: AgentSessionLifecycleCommandKind;
  status: "archived" | "deleted" | "legal_hold_placed" | "legal_hold_released";
  retentionDueAt: string | null;
}

export interface AgentInteractionSessionLifecyclePort {
  execute(
    input: AgentInteractionSessionLifecycleInput,
  ): Promise<AgentInteractionSessionLifecycleResult>;
}
