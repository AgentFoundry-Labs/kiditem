import type {
  DetailImageCount,
  DetailPageAgeGroup,
  DetailPageTemplateId,
} from '@kiditem/shared/ai';
import type {
  KcCertificationStatus,
  UsageSectionMode,
} from '../../../../domain/prompts/detail-page/types';

export const PRODUCT_GENERATION_AI_TRIGGER_PORT = Symbol('PRODUCT_GENERATION_AI_TRIGGER_PORT');

export type ProductGenerationTask = 'all' | 'detail' | 'thumbnail';

export interface ProductGenerationAiRequest {
  organizationId: string;
  /** Caller-owned immutable request coordinate; runtime rejects an unlocked request. */
  idempotencyKey?: string;
  /** Canonical request digest required with the idempotency coordinate. */
  requestHash?: string;
  triggeredByUserId: string | null;
  candidateId: string;
  productName: string;
  category?: string | null;
  description?: string | null;
  target?: string | null;
  imageUrls: string[];
  thumbnailUrl?: string | null;
  optionNames: string[];
  templateId: DetailPageTemplateId;
  ageGroup: DetailPageAgeGroup;
  detailImageCount: DetailImageCount;
  usageSectionMode: UsageSectionMode;
  kcCertificationStatus: KcCertificationStatus;
  kcCertificationNumber?: string | null;
  productSize?: string | null;
  colorVariantStatus?: string | null;
  colorVariantNames?: string | null;
  boxSetStatus?: string | null;
  boxSetQuantity?: string | null;
  task?: ProductGenerationTask;
}

export interface ProductGenerationAiResult {
  candidateId: string;
  detailGenerationId: string | null;
  thumbnailGenerationId: string | null;
  contentWorkspaceId: string | null;
  href: string;
}

/**
 * 다른 데서 가져온 상품의 **이미 있는 상세페이지**를 등록한다. AI 를 돌리지 않는다 —
 * 올린 이미지를 우리 상세페이지 한 판으로 만들어 그 상품의 현재 상세페이지로 건다
 * (사장님 2026-09-22: "상세페이지를 업로드해서 등록을 하고 싶어").
 */
export interface RegisterUploadedDetailPageRequest {
  organizationId: string;
  triggeredByUserId: string | null;
  candidateId: string;
  productName: string;
  /** 올린 상세페이지 이미지. 순서가 곧 상세페이지에 쌓이는 순서다. */
  detailPageImageUrls: string[];
}

export interface RegisterUploadedDetailPageResult {
  candidateId: string;
  detailGenerationId: string;
  contentWorkspaceId: string;
  href: string;
}

export interface ProductGenerationAiTriggerPort {
  startForCandidate(input: ProductGenerationAiRequest): Promise<ProductGenerationAiResult>;
  registerUploadedDetailPage(
    input: RegisterUploadedDetailPageRequest,
  ): Promise<RegisterUploadedDetailPageResult>;
}
