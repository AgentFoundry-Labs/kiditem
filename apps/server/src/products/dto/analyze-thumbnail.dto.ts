import { IsOptional, IsString, IsUUID, IsArray, IsIn } from 'class-validator';

export class AnalyzeThumbnailDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsIn(['all', 'quality', 'compliance'])
  scope?: 'all' | 'quality' | 'compliance';
}

export class AnalyzeBatchDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  productIds: string[];

  @IsOptional()
  @IsIn(['all', 'quality', 'compliance'])
  scope?: 'all' | 'quality' | 'compliance';
}
