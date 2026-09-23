import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

const PRODUCT_TITLE_MESSAGE = '상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.';
const PRODUCT_TITLE_PATTERN = /^(?=.*[\p{L}\p{N}])[\p{L}\p{N}\s]+$/u;

export class ListContentWorkspacesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;
}

export class DuplicateContentWorkspaceQueryDto {
  @IsString()
  @MaxLength(160)
  @Matches(PRODUCT_TITLE_PATTERN, { message: PRODUCT_TITLE_MESSAGE })
  title!: string;
}

export class CreateContentWorkspaceDto {
  @IsString()
  @MaxLength(160)
  @Matches(PRODUCT_TITLE_PATTERN, { message: PRODUCT_TITLE_MESSAGE })
  title!: string;

  @IsOptional()
  @IsUUID()
  salesProductId?: string;

}

/** 상세가 없는 판매상품에 허브가 처음 쓰는 상세 HTML — 편집기 저장과 같은 상한. */
export class CreateManualDetailPageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000)
  html!: string;
}

export class SelectContentWorkspaceDetailPageDto {
  @IsUUID()
  contentGenerationId!: string;
}

export class SelectContentWorkspaceThumbnailDto {
  @IsUUID()
  assetId!: string;
}

export class ReplaceContentWorkspaceThumbnailGalleryDto {
  @IsArray()
  @ArrayMaxSize(20)
  // 우리 오브젝트 스토리지 URL 이 들어온다. 로컬 MinIO(`http://localhost:9000/...`)는 TLD 가 없어 `require_tld: false`.
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'], require_tld: false },
    { each: true },
  )
  thumbnailUrls!: string[];
}

export class ContentWorkspaceIdParamDto {
  @IsUUID()
  workspaceId!: string;
}
