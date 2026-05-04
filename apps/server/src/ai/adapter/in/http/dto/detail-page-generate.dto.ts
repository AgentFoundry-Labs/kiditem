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
  @IsIn(['kids-playful', 'simple-vertical'])
  templateId?: 'kids-playful' | 'simple-vertical';
}
