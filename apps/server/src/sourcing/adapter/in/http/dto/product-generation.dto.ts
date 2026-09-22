import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RegisterManualProductDto } from './register-manual-product.dto';

export class CreateProductGenerationDto extends RegisterManualProductDto {
  /**
   * 다른 데서 가져온 상품의 **이미 있는 상세페이지** 이미지. 이 칸이 차 있으면 AI 상세페이지 ·
   * 썸네일 생성을 **돌리지 않고** 올린 상세페이지를 그대로 건다(사장님 2026-09-22).
   * 순서가 곧 상세페이지에 쌓이는 순서다.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  detailPageImageUrls?: string[];

  @IsOptional()
  @IsIn(['kids-playful', 'bold-vertical'])
  templateId?: 'kids-playful' | 'bold-vertical';

  @IsOptional()
  @IsIn(['age-8-plus', 'age-14-plus'])
  ageGroup?: 'age-8-plus' | 'age-14-plus';

  @IsOptional()
  @IsIn(['2', '3', '4', '5', '6'])
  detailImageCount?: '2' | '3' | '4' | '5' | '6';

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
  @IsString()
  @MaxLength(120)
  productSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  colorVariantStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  colorVariantNames?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  boxSetStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  boxSetQuantity?: string;

  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  imageUrls!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;
}
