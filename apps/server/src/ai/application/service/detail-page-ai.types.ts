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
  baseContentGenerationId?: string;
  ageGroup?: DetailPageAgeGroup;
  detailImageCount?: DetailImageCount;
  usageSectionMode?: UsageSectionMode;
  kcCertificationStatus?: KcCertificationStatus;
  kcCertificationNumber?: string;
  sourceReferences?: DetailPageSourceReference[];
}

export interface DetailPageSourceReference {
  sourceType: 'sourcing_candidate' | 'input_asset' | 'content_generation';
  sourceCandidateId?: string;
  contentAssetId?: string;
  sourceContentGenerationId?: string;
  label?: string;
}

export interface KidsPlayfulImageContext {
  packageImageIndices: Set<number>;
  safetyLabelImageIndices: Set<number>;
}

export type DetailPageParsedGeneration = DetailPageGeneration | BoldVerticalGeneration;

export interface DetailPagePrefillDto {
  category: string;
  target: string;
  features: string[];
  options: string[];
  description: string;
  extraNotes: string;
  estimatedSeconds: number;
}

export interface DetailPageGenerationDto {
  id: string;
  productId: string | null;
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
