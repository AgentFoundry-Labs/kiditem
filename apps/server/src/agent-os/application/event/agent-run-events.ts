/**
 * Agent OS run lifecycle events broadcast on the global EventEmitter2 bus.
 *
 * `FINALIZED` fires when `AgentRunExecutor` writes a terminal `AgentRun`
 * status (`succeeded` / `failed`). Listeners outside the agent-os owner
 * domain (eg. the operation-alert bridge in `automation/`) subscribe to
 * close any per-domain ledger entries linked to the `AgentRunRequest`.
 *
 * The bus payload deliberately carries `requestId` (the durable request
 * identity) plus `runId` (the executor attempt). Producers like the rules
 * domain keyed their operation alerts off `requestId`, so the bridge can
 * resolve the matching alert without coupling to per-domain prefixes.
 */
export const AGENT_RUN_EVENTS = {
  FINALIZED: 'agent.run.finalized',
} as const;

export interface AgentRunFinalizedEvent {
  organizationId: string;
  requestId: string;
  runId: string;
  /**
   * Terminal AgentRun status. `failed` here always represents a terminal
   * AgentRunRequest state too — retryable failures (request returned to
   * `pending`) do NOT emit FINALIZED, so listeners can close their alerts
   * unconditionally.
   */
  status: 'succeeded' | 'failed';
  output?: unknown;
  errorCode?: string;
  errorMessage?: string;
}
