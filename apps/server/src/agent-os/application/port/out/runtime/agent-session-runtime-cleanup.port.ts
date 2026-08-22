import type { AgentSessionRuntimeCleanupInput, AgentSessionRuntimeCleanupResult } from "./agent-durable-runtime.port";

export const AGENT_SESSION_RUNTIME_CLEANUP_PORT = Symbol(
  "AGENT_SESSION_RUNTIME_CLEANUP_PORT",
);
export interface AgentSessionRuntimeCleanupPort {
  cleanup(input: AgentSessionRuntimeCleanupInput): Promise<AgentSessionRuntimeCleanupResult>;
}
