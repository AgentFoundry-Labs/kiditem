import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const EDITOR_MODES = ['edit', 'creative'] as const;
const EDITOR_PURPOSES = ['compliance', 'quality'] as const;
const LAYOUTS = ['auto', 'fan', 'arch', 'grid', 'stack', 'radial'] as const;

export class ThumbnailEditorDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  sourceCandidateId?: string;

  @IsOptional()
  @IsString()
  registrationWorkspaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @IsOptional()
  @IsString()
  productImage?: string;

  @IsOptional()
  @IsString()
  packagingImage?: string;

  @IsOptional()
  @IsString()
  backgroundReference?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  colorImages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  bundleImages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(12)
  bundleLabels?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pieceCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  colorCount?: number;

  @IsIn(EDITOR_PURPOSES)
  purpose!: 'compliance' | 'quality';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplementaryLabel?: string;

  @IsOptional()
  @IsIn(EDITOR_MODES)
  mode?: 'edit' | 'creative';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sceneType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  styleType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  productDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userPrompt?: string;

  @IsOptional()
  @IsIn(LAYOUTS)
  layout?: 'auto' | 'fan' | 'arch' | 'grid' | 'stack' | 'radial';
}
