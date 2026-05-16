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
