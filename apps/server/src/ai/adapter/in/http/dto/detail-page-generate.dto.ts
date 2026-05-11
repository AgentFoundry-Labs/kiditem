import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  imageUrls!: string[];

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
