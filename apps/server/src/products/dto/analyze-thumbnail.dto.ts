import { IsOptional, IsString, IsUUID, IsArray } from 'class-validator';

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
}

export class AnalyzeBatchDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  productIds: string[];
}
