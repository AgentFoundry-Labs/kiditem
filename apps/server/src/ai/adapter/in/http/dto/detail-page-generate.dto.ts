import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DETAIL_IMAGE_COUNTS,
  DETAIL_PAGE_AGE_GROUPS,
  DETAIL_PAGE_TEMPLATE_IDS,
  type DetailImageCount,
  type DetailPageAgeGroup,
  type DetailPageTemplateId,
} from '@kiditem/shared/ai';
import type {
  DetailPageSourceReferenceInput,
  GenerateDetailPageInput,
  PrefillDetailPageInput,
} from '../../../../application/service/detail-page-requests';

const DETAIL_PAGE_GENERATION_MODES = ['draft', 'image', 'full'] as const;
const PRODUCT_TITLE_MESSAGE = '상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.';
const PRODUCT_TITLE_PATTERN = /^(?=.*[\p{L}\p{N}])[\p{L}\p{N}\s]+$/u;

export class DetailPageSourceReferenceDto implements DetailPageSourceReferenceInput {
  @IsIn(['sourcing_candidate', 'input_asset', 'content_generation'])
  sourceType!: 'sourcing_candidate' | 'input_asset' | 'content_generation';

  @IsOptional()
  @IsUUID()
  sourceCandidateId?: string;

  @IsOptional()
  @IsUUID()
  contentAssetId?: string;

  @IsOptional()
  @IsUUID()
  sourceContentGenerationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class GenerateDetailPageBodyDto implements GenerateDetailPageInput {
  @IsString()
  @MinLength(1)
  @Matches(PRODUCT_TITLE_PATTERN, { message: PRODUCT_TITLE_MESSAGE })
  rawTitle!: string;

  @IsString()
  rawCategory!: string;

  @IsString()
  rawDescription!: string;

  @IsString()
  rawOptions!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsIn(['first', 'llm-pick'])
  heroImageMode?: 'first' | 'llm-pick';

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  contentWorkspaceId?: string;

  @IsOptional()
  @IsIn(DETAIL_PAGE_TEMPLATE_IDS)
  templateId?: DetailPageTemplateId;

  @IsOptional()
  @IsIn(DETAIL_PAGE_GENERATION_MODES)
  generationMode?: 'draft' | 'image' | 'full';

  @IsOptional()
  @IsIn(DETAIL_PAGE_AGE_GROUPS)
  ageGroup?: DetailPageAgeGroup;

  @IsOptional()
  @IsIn(DETAIL_IMAGE_COUNTS)
  detailImageCount?: DetailImageCount;

  @IsOptional()
  @IsIn(['include', 'exclude'])
  usageSectionMode?: 'include' | 'exclude';

  @IsOptional()
  @IsIn(['unknown', 'none', 'exists'])
  kcCertificationStatus?: 'unknown' | 'none' | 'exists';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  kcCertificationNumber?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DetailPageSourceReferenceDto)
  sourceReferences?: DetailPageSourceReferenceDto[];
}

export class PrefillDetailPageBodyDto implements PrefillDetailPageInput {
  @IsString()
  @MinLength(1)
  @Matches(PRODUCT_TITLE_PATTERN, { message: PRODUCT_TITLE_MESSAGE })
  rawTitle!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  imageUrls?: string[];
}
