import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  DETAIL_IMAGE_COUNTS,
  DETAIL_PAGE_AGE_GROUPS,
  DETAIL_PAGE_TEMPLATE_IDS,
  type DetailImageCount,
  type DetailPageAgeGroup,
  type DetailPageTemplateId,
} from '@kiditem/shared/ai';

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
