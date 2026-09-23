import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const EDITOR_MODES = ['edit', 'creative'] as const;
const EDITOR_PURPOSES = ['compliance', 'quality'] as const;
const LAYOUTS = ['auto', 'fan', 'arch', 'grid', 'stack', 'radial'] as const;

export class ThumbnailEditorDto {
  @IsEmpty({
    message: 'productId는 제거되었습니다. contentWorkspaceId를 사용하세요',
  })
  productId?: never;

  @IsEmpty({
    message: 'masterId는 제거되었습니다. contentWorkspaceId를 사용하세요',
  })
  masterId?: never;

  @IsEmpty({
    message: 'sourceCandidateId는 제거되었습니다. contentWorkspaceId를 사용하세요',
  })
  sourceCandidateId?: never;

  @IsOptional()
  @IsString()
  contentWorkspaceId?: string;

  /**
   * 판매상품 초안에서 여는 편집. 초안의 작업공간을 찾거나 만들어 그 작업공간에 묶는다 —
   * 작업공간이 아직 없는 초안에서 시작해도 주인 없는 생성이 되지 않는다. contentWorkspaceId 와 함께 쓰지 않는다.
   */
  @IsOptional()
  @IsUUID()
  salesProductId?: string;

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
