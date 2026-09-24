import {
  Equals,
  IsInt,
  IsOptional,
  IsUUID,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  DETAIL_PAGE_CLIENT_RENDER_MAX_BYTES,
  DETAIL_PAGE_CLIENT_RENDER_MAX_HEIGHT,
  DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
} from '@kiditem/shared/ai';

export class FinalizeDetailPageClientRenderDto {
  @IsInt()
  @Min(1)
  @Max(DETAIL_PAGE_CLIENT_RENDER_MAX_BYTES)
  byteLength!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  sha256!: string;

  @IsInt()
  @Equals(DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH)
  pixelWidth!: typeof DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH;

  @IsInt()
  @Min(1)
  @Max(DETAIL_PAGE_CLIENT_RENDER_MAX_HEIGHT)
  pixelHeight!: number;
}

export class FailDetailPageClientRenderDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,64}$/)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  message!: string;
}

/** 서버 렌더 요청(KID-321). `detailPageRevisionId` 를 주면 그 revision 을, 없으면 작업공간의 현재 revision 을 렌더한다. */
export class PrepareDetailPageServerRenderDto {
  @IsOptional()
  @IsUUID()
  detailPageRevisionId?: string;
}
