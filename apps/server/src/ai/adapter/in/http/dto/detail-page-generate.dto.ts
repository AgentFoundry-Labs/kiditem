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
  @IsIn(['kids-playful', 'bold-vertical'])
  templateId?: 'kids-playful' | 'bold-vertical';

  @IsOptional()
  @IsIn(['age-8-plus', 'age-14-plus'])
  ageGroup?: 'age-8-plus' | 'age-14-plus';

  @IsOptional()
  @IsIn(['auto', '1', '2', '3'])
  detailImageCount?: 'auto' | '1' | '2' | '3';
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
