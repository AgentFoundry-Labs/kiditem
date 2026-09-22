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

export interface SourcingRegisterUploadedDetailPageRequest {
  organizationId: string;
  triggeredByUserId: string | null;
  candidateId: string;
  productName: string;
  detailPageImageUrls: string[];
}

export interface SourcingRegisterUploadedDetailPageResult {
  candidateId: string;
  detailGenerationId: string;
  contentWorkspaceId: string;
  href: string;
}

export interface SourcingAgentGatewayPort {
  startProductGeneration(
    request: SourcingStartProductGenerationRequest,
  ): Promise<SourcingStartProductGenerationResult>;
  /** 이미 있는 상세페이지를 그대로 건다. AI 는 돌지 않는다. */
  registerUploadedDetailPage(
    request: SourcingRegisterUploadedDetailPageRequest,
  ): Promise<SourcingRegisterUploadedDetailPageResult>;
}