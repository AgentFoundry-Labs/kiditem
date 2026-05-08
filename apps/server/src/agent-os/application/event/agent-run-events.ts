/**
 * Agent OS run lifecycle events broadcast on the global EventEmitter2 bus.
 *
 * `FINALIZED` fires when `AgentRunExecutor` writes a terminal request state
 * (`succeeded` / `failed`). Most finalized requests have an `AgentRun`, but
 * pre-run validation failures can terminate the request before a run row
 * exists. Listeners outside the agent-os owner domain (eg. the operation-alert
 * bridge in `automation/`) subscribe to close any per-domain ledger entries
 * linked to the `AgentRunRequest`.
 *
 * The bus payload deliberately carries `requestId` (the durable request
 * identity) plus optional `runId` (the executor attempt). Producers like the
 * rules domain keyed their operation alerts off `requestId`, so the bridge can
 * resolve the matching alert even when no run row was created.
 */
export const AGENT_RUN_EVENTS = {
  FINALIZED: 'agent.run.finalized',
} as const;

export interface AgentRunFinalizedEvent {
  organizationId: string;
  requestId: string;
  runId?: string;
  /**
   * Terminal request status. Retryable failures (request returned to `pending`)
   * do NOT emit FINALIZED, so listeners can close their alerts unconditionally.
   */
  status: 'succeeded' | 'failed';
  output?: unknown;
  errorCode?: string;
  errorMessage?: string;
}
