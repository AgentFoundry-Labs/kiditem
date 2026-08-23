import type { AgentTaskStatus } from "@kiditem/shared/agent-interaction";

export type AgentWorkPresentationState =
  | "running"
  | "awaiting_approval"
  | "awaiting_operation"
  | "awaiting_child"
  | "needs_input"
  | "needs_continue"
  | "terminal"
  | "error";

/** Presentation-only state. None of these labels are persisted on AgentTask. */
export class AgentWorkProjectionService {
  project(input: {
    taskStatus: AgentTaskStatus;
    hasLiveAttempt: boolean;
    hasPendingApproval: boolean;
    hasReadyOrExecutingMutation: boolean;
    hasLiveChild: boolean;
    needsInput: boolean;
    lastAttemptFailed: boolean;
  }): AgentWorkPresentationState {
    if (input.taskStatus === "failed") return "error";
    if (input.taskStatus !== "open") return "terminal";
    if (input.hasPendingApproval) return "awaiting_approval";
    if (input.hasReadyOrExecutingMutation) return "awaiting_operation";
    if (input.hasLiveChild) return "awaiting_child";
    if (input.hasLiveAttempt) return "running";
    if (input.needsInput) return "needs_input";
    return "needs_continue";
  }
}
