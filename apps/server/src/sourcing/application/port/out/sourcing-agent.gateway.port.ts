/**
 * Outgoing port for sourcing → Agent OS delegation.
 * Sourcing domain shall not call Agent OS / runtime directly.
 */
import type {
  ProductGenerationAiRequest,
  ProductGenerationAiResult,
} from '../../../../ai/application/port/in/generation/product-generation-ai-trigger.port';

export const SOURCING_AGENT_GATEWAY_PORT = Symbol('SOURCING_AGENT_GATEWAY_PORT');

export interface SourcingScrapeRequest {
  organizationId: string;
  url: string;
  triggeredByUserId?: string | null;
}

export interface SourcingScrapeResult {
  taskId: string;
  requestId?: string;
}

export interface SourcingNotifyPromotedRequest {
  organizationId: string;
  masterId: string;
}

export type SourcingStartProductGenerationRequest = ProductGenerationAiRequest;
export type SourcingStartProductGenerationResult = ProductGenerationAiResult;

export interface SourcingAgentGatewayPort {
  scrapeUrl(request: SourcingScrapeRequest): Promise<SourcingScrapeResult>;
  /**
   * Fire-and-forget signal that a candidate was promoted to master.
   * Adapter delegates to ai domain's POST_PROMOTION_AI_TRIGGER_PORT.
   * Failures raise an OperationAlert; method does not throw.
   */
  notifyPromoted(request: SourcingNotifyPromotedRequest): Promise<void>;
  startProductGeneration(
    request: SourcingStartProductGenerationRequest,
  ): Promise<SourcingStartProductGenerationResult>;
}
