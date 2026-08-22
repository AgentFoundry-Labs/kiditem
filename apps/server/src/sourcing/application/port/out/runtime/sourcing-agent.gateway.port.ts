/**
 * Outgoing port for sourcing → Agent OS delegation.
 * Sourcing domain shall not call Agent OS / runtime directly.
 */
import type {
  ProductGenerationAiRequest,
  ProductGenerationAiResult,
} from '../../../../../ai/application/port/in/generation/product-generation-ai-trigger.port';

export const SOURCING_AGENT_GATEWAY_PORT = Symbol('SOURCING_AGENT_GATEWAY_PORT');

export type SourcingStartProductGenerationRequest = ProductGenerationAiRequest;
export type SourcingStartProductGenerationResult = ProductGenerationAiResult;

export interface SourcingAgentGatewayPort {
  startProductGeneration(
    request: SourcingStartProductGenerationRequest,
  ): Promise<SourcingStartProductGenerationResult>;
}
