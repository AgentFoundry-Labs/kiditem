import { IsArray, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export type AnalysisScope = 'all' | 'quality' | 'compliance';

export class AnalyzeThumbnailDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsIn(['all', 'quality', 'compliance'])
  scope?: AnalysisScope;
}

export class AnalyzeBatchDto {
  @IsArray()
  @IsString({ each: true })
  productIds!: string[];

  @IsOptional()
  @IsIn(['all', 'quality', 'compliance'])
  scope?: AnalysisScope;
}

export class CheckImageSpecDto {
  @IsUrl({ require_tld: false })
  imageUrl!: string;
}

export class PreInspectDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}
