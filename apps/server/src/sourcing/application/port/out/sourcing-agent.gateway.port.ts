/**
 * Outgoing port for sourcing → Agent OS delegation.
 *
 * The sole reason this port exists is the architecture contract rule that
 * Agent OS / runtime delegation must sit behind an application-owned port
 * (see docs/superpowers/plans/2026-04-29-backend-architecture-contract.md
 * "When Ports Are Mandatory"). The adapter binds this port to
 * `AgentRegistryService.runByType('sourcing', ...)`.
 */
export const SOURCING_AGENT_GATEWAY_PORT = Symbol('SOURCING_AGENT_GATEWAY_PORT');

export interface SourcingScrapeRequest {
  companyId: string;
  url: string;
}

export interface SourcingScrapeResult {
  taskId: string;
}

export interface SourcingAgentGatewayPort {
  scrapeUrl(request: SourcingScrapeRequest): Promise<SourcingScrapeResult>;
}
