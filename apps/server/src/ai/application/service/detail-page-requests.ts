import type {
  DetailImageCount,
  DetailPageAgeGroup,
  DetailPageTemplateId,
} from '@kiditem/shared/ai';

export type DetailPageSourceReferenceType =
  | 'sourcing_candidate'
  | 'input_asset'
  | 'content_generation';

export interface DetailPageSourceReferenceInput {
  sourceType: DetailPageSourceReferenceType;
  sourceCandidateId?: string;
  contentAssetId?: string;
  sourceContentGenerationId?: string;
  label?: string;
}

export interface GenerateDetailPageInput {
  rawTitle: string;
  rawCategory: string;
  rawDescription: string;
  rawOptions: string;
  imageUrls?: string[];
  heroImageMode?: 'first' | 'llm-pick';
  contentWorkspaceId?: string;
  templateId?: DetailPageTemplateId;
  generationMode?: 'draft' | 'image' | 'full';
  ageGroup?: DetailPageAgeGroup;
  detailImageCount?: DetailImageCount;
  usageSectionMode?: 'include' | 'exclude';
  kcCertificationStatus?: 'unknown' | 'none' | 'exists';
  kcCertificationNumber?: string;
  sourceReferences?: DetailPageSourceReferenceInput[];
}

export interface PrefillDetailPageInput {
  rawTitle: string;
  imageUrls?: string[];
}

export interface RenderImageInput {
  html: string;
  baseUrl?: string;
  viewportWidth?: number;
  renderScale?: number;
  outputWidth?: number;
  format?: 'png' | 'jpeg';
  quality?: number;
}
