import type {
  DetailImageCount,
  DetailPageAgeGroup,
  DetailPageTemplateId as SharedDetailPageTemplateId,
} from '@kiditem/shared/ai';
import type { BoldVerticalGeneration } from '../../domain/prompts/bold-vertical/single-call';
import type { DetailPageGeneration } from '../../domain/prompts/detail-page/single-call';
import type {
  KcCertificationStatus,
  UsageSectionMode,
} from '../../domain/prompts/detail-page/types';

export type DetailPageTemplateId = SharedDetailPageTemplateId;

export interface DetailPageRawInput {
  rawTitle: string;
  rawCategory: string;
  rawDescription: string;
  rawOptions: string;
  imageUrls: string[];
  heroImageMode: 'first' | 'llm-pick';
  templateId: DetailPageTemplateId;
  generationMode?: 'draft' | 'image' | 'full';
  /** 이미지만 다시 만들 때 결과를 빌려 온 생성 페이지. */
  baseDetailPageId?: string;
  ageGroup?: DetailPageAgeGroup;
  detailImageCount?: DetailImageCount;
  usageSectionMode?: UsageSectionMode;
  kcCertificationStatus?: KcCertificationStatus;
  kcCertificationNumber?: string;
  sourceReferences?: DetailPageSourceReference[];
  productGenerationRequestHash?: string;
}

export interface DetailPageSourceReference {
  sourceType: 'sourcing_candidate' | 'input_asset' | 'detail_page';
  sourceCandidateId?: string;
  contentAssetId?: string;
  sourceDetailPageId?: string;
  label?: string;
}

export interface KidsPlayfulImageContext {
  packageImageIndices: Set<number>;
  safetyLabelImageIndices: Set<number>;
}

export type DetailPageParsedGeneration = DetailPageGeneration | BoldVerticalGeneration;

export interface DetailPagePrefillDto {
  category: string;
  keyword: string;
  target: string;
  features: string[];
  options: string[];
  description: string;
  extraNotes: string;
  estimatedSeconds: number;
}

export interface DetailPageGenerationDto {
  id: string;
  contentWorkspaceId: string;
  templateId: DetailPageTemplateId;
  productName: string;
  rawInput: DetailPageRawInput;
  result: DetailPageGeneration | BoldVerticalGeneration | unknown;
  imageUrls: string[];
  processedImages: Record<string, string>;
  imageProcessingStatus: string;
  imageProcessingError: string | null;
  createdAt: string;
}
