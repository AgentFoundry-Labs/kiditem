/**
 * Outgoing port for sourcing → Agent OS delegation.
 *
 * The sole reason this port exists is the architecture contract rule that
 * Agent OS / runtime delegation must sit behind an application-owned port
 * (see apps/server/AGENTS.md "Application port rule"). The adapter binds this
 * port to the Agent OS `AGENT_RUNNER_PORT.runByType('sourcing', ...)` hop.
 */
export const SOURCING_AGENT_GATEWAY_PORT = Symbol('SOURCING_AGENT_GATEWAY_PORT');

export interface SourcingScrapeRequest {
  organizationId: string;
  url: string;
  /**
   * Actor that triggered the scrape, when known. The adapter forwards this
   * onto `AGENT_RUNNER_PORT.runByType('sourcing', ...)` as
   * `requestedByUserId` so the FINALIZED bridge can synthesize a fallback
   * Alert if the producer-owned alert is missed. `null` for system/cron
   * triggers.
   */
  triggeredByUserId?: string | null;
}

export interface SourcingScrapeResult {
  /**
   * Legacy `taskId` contract. Prefer `runId` (live `AgentRun.id`); falls
   * back to `requestId` (`AgentRunRequest.id`) only when the runner deferred
   * execution.
   */
  taskId: string;
  /**
   * Durable `AgentRunRequest.id`. Surfaced separately so the sourcing
   * application service can open a producer-owned operation alert keyed by
   * `(sourceType='agent_run_request', sourceId=requestId)` — the bridge
   * closes the same row on FINALIZED. Absent when the runner did not
   * produce a request id (e.g. agent instance disabled).
   */
  requestId?: string;
}

export interface SourcingDetailPageGenerateRequest {
  organizationId: string;
  productId: string;
  mode: 'draft' | 'image' | 'full';
  templateId: string;
  seed_hook_text?: string;
  seed_hook_title_sub?: string;
  seed_hero_image?: string;
}

export interface SourcingDetailPageGenerateResult {
  taskId: string;
}

export interface SourcingAgentGatewayPort {
  scrapeUrl(request: SourcingScrapeRequest): Promise<SourcingScrapeResult>;
  generateDetailPage(
    request: SourcingDetailPageGenerateRequest,
  ): Promise<SourcingDetailPageGenerateResult>;
}
