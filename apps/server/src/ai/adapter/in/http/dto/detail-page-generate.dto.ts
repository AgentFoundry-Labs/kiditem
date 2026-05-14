import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
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

const DETAIL_PAGE_GENERATION_MODES = ['draft', 'image', 'full'] as const;

export class DetailPageSourceReferenceDto {
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

export class GenerateDetailPageBodyDto {
  @IsString()
  @MinLength(1)
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

export class PrefillDetailPageBodyDto {
  @IsString()
  @MinLength(1)
  rawTitle!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  imageUrls?: string[];
}
