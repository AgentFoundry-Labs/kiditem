/**
 * Agent OS run lifecycle events broadcast on the global EventEmitter2 bus.
 *
 * `FINALIZED` fires when `AgentRunExecutor` writes a terminal request state
 * (`succeeded` / `failed`). Most finalized requests have an `AgentRun`, but
 * pre-run validation failures can terminate the request before a run row
 * exists. Listeners outside the agent-os owner domain (eg. the operation-alert
 * bridge in `automation/`, the AI domain detail-page/thumbnail bridges)
 * subscribe to close any per-domain ledger entries linked to the
 * `AgentRunRequest`.
 *
 * The bus payload carries:
 *
 *   - `requestId` (always) — the durable `AgentRunRequest.id`. Producers like
 *     the rules domain key their operation alerts off this, so the bridge can
 *     resolve the matching alert even when no run row was created.
 *   - `runId` (optional) — the executor attempt. Absent on pre-run failures.
 *   - `agentType` — the resolved Agent OS type (eg. `detail_page_generate`).
 *     Listeners filter on this rather than on the `AgentRunRequest.source`
 *     string, because two consumers can share a source but pick different
 *     agent types.
 *   - `source` — `AgentRunRequest.source`. Same value the producer set on
 *     `runByType({ sourceType })`. Useful for cross-domain auditing.
 *   - `sourceResourceType` / `sourceResourceId` — the producer-provided
 *     downstream resource pointer (eg. `ContentGeneration.id`). Bridges use
 *     this to apply the runtime output back onto the originating row without
 *     re-reading the request.
 *   - `requestedByUserId` — the user who triggered the run (when known).
 *     Threaded so the operation-alert bridge can synthesize a user-facing
 *     fallback `Alert` for failed runs whose producer never opened one.
 *     `null` when the request is system/cron/workflow-driven; the fallback
 *     bridge intentionally skips those because Agent OS observability owns
 *     non-user signals.
 *
 * Important — listeners must not infer routing from `output.__envelope` or
 * any other in-band field. The bus payload itself is the routing surface.
 * Failure events have no `output`, so envelope-only filtering would silently
 * drop real failures of agents the bridge owns.
 */
export const AGENT_RUN_EVENTS = {
  FINALIZED: 'agent.run.finalized',
} as const;

export interface AgentRunFinalizedEvent {
  organizationId: string;
  requestId: string;
  runId?: string;
  agentType: string;
  source: string;
  sourceResourceType: string | null;
  sourceResourceId: string | null;
  /**
   * User who triggered the run, when known. `null` for system/cron/workflow
   * triggers. The operation-alert bridge consults this to decide whether to
   * synthesize a fallback failure alert when the producer never opened one.
   */
  requestedByUserId: string | null;
  /**
   * Terminal request status. Retryable failures (request returned to `pending`)
   * do NOT emit FINALIZED, so listeners can close their alerts unconditionally.
   */
  status: 'succeeded' | 'failed';
  output?: unknown;
  errorCode?: string;
  errorMessage?: string;
}
