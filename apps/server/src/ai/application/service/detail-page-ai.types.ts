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
  ageGroup?: DetailPageAgeGroup;
  detailImageCount?: DetailImageCount;
  usageSectionMode?: UsageSectionMode;
  kcCertificationStatus?: KcCertificationStatus;
  kcCertificationNumber?: string;
}

export interface KidsPlayfulImageContext {
  packageImageIndices: Set<number>;
  safetyLabelImageIndices: Set<number>;
}

export type DetailPageParsedGeneration = DetailPageGeneration | BoldVerticalGeneration;
