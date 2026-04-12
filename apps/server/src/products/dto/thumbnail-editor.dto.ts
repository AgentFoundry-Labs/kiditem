import { IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ThumbnailEditorDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  packagingImage?: string;

  @IsOptional()
  @IsString()
  productImage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pieceCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  colorCount?: number;

  @IsString()
  purpose: string;
}
