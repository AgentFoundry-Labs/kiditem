/**
 * Outgoing port for sourcing → Agent OS delegation.
 * Sourcing domain shall not call Agent OS / runtime directly.
 */
import type {
  ProductGenerationAiRequest,
  ProductGenerationAiResult,
} from '../../../../../ai/application/port/in/generation/product-generation-ai-trigger.port';

export const SOURCING_AGENT_GATEWAY_PORT = Symbol('SOURCING_AGENT_GATEWAY_PORT');

export interface SourcingScrapeRequest {
  organizationId: string;
  url: string;
  triggeredByUserId?: string | null;
  conversationId?: string | null;
  parentRequestId?: string | null;
  delegatedByRunId?: string | null;
}

export interface SourcingScrapeResult {
  taskId: string;
  requestId?: string;
}

export type SourcingStartProductGenerationRequest = ProductGenerationAiRequest;
export type SourcingStartProductGenerationResult = ProductGenerationAiResult;

export interface SourcingAgentGatewayPort {
  scrapeUrl(request: SourcingScrapeRequest): Promise<SourcingScrapeResult>;
  startProductGeneration(
    request: SourcingStartProductGenerationRequest,
  ): Promise<SourcingStartProductGenerationResult>;
}
