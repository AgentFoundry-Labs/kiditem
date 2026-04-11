import { IsString, IsOptional } from 'class-validator';

export class ThumbnailEditorDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  packagingImageUrl?: string;

  @IsOptional()
  @IsString()
  productImageUrl?: string;

  @IsOptional()
  @IsString()
  composition?: string;

  @IsString()
  purpose: string;
}
