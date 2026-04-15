import { IsString, IsOptional, IsInt, IsArray, ArrayMinSize, ArrayMaxSize, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ThumbnailEditorDto {
  // ── 기존 필드 ──
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

  // ── Type 2: 보조 이미지 ──
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplementaryLabel?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  colorImages?: string[];

  // ── 모드 + Type 3 ──
  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  sceneType?: string;

  @IsOptional()
  @IsString()
  styleType?: string;

  @IsOptional()
  @IsString()
  productDescription?: string;

  @IsOptional()
  @IsString()
  backgroundReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userPrompt?: string;
}
