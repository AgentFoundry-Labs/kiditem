/**
 * Outgoing port for sourcing → Agent OS delegation.
 * Sourcing domain shall not call Agent OS / runtime directly.
 */
import type {
  ProductGenerationAiRequest,
  ProductGenerationAiResult,
} from '../../../../../content/application/port/in/generation/product-generation-ai-trigger.port';

export const SOURCING_AGENT_GATEWAY_PORT = Symbol('SOURCING_AGENT_GATEWAY_PORT');

export type SourcingStartProductGenerationRequest = ProductGenerationAiRequest;
export type SourcingStartProductGenerationResult = ProductGenerationAiResult;

export interface SourcingRegisterUploadedDetailPageRequest {
  organizationId: string;
  triggeredByUserId: string | null;
  /** 상세페이지가 걸리는 판매상품 초안. 콘텐츠 작업공간은 초안이 가진다(KID-310). */
  salesProductId: string;
  productName: string;
  detailPageImageUrls: string[];
}

export interface SourcingRegisterUploadedDetailPageResult {
  salesProductId: string;
  detailPageId: string;
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