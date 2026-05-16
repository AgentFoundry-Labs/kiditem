import type {
  DetailImageCount,
  DetailPageAgeGroup,
  DetailPageTemplateId,
} from '@kiditem/shared/ai';
import type {
  KcCertificationStatus,
  UsageSectionMode,
} from '../../../domain/prompts/detail-page/types';

export const PRODUCT_GENERATION_AI_TRIGGER_PORT = Symbol('PRODUCT_GENERATION_AI_TRIGGER_PORT');

export interface ProductGenerationAiRequest {
  organizationId: string;
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
}

export interface ProductGenerationAiResult {
  candidateId: string;
  parentOperationKey: string;
  detailGenerationId: string | null;
  thumbnailGenerationId: string | null;
  registrationWorkspaceId: string | null;
  href: string;
}

export interface ProductGenerationAiTriggerPort {
  startForCandidate(input: ProductGenerationAiRequest): Promise<ProductGenerationAiResult>;
}
