import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const INT4_MAX = 2_147_483_647;

// 틱톡 크리에이티브 센터에서 스크랩하는 트렌드 종류.
export const TIKTOK_CC_TREND_TYPES = ['hashtag', 'keyword', 'product', 'song'] as const;
export type TiktokCcTrendTypeValue = (typeof TIKTOK_CC_TREND_TYPES)[number];

export class ExtensionTiktokCcTrendItemDto {
  @IsIn(TIKTOK_CC_TREND_TYPES)
  trendType!: TiktokCcTrendTypeValue;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\S/)
  entityKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceKeyword?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000)
  rank?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  postCount?: number;

  // 틱톡 조회수는 int4(21억)를 넘을 수 있어 상한을 크게 잡는다(BigInt 컬럼).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9_000_000_000_000)
  viewCount?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-100_000)
  @Max(10_000_000)
  growthPct?: number;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2_048)
  thumbnailUrl?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2_048)
  sourceUrl?: string;
}

export class ExtensionTiktokCcTrendErrorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  target!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  @Matches(/\S/)
  message!: string;
}

export class IngestExtensionTiktokCcTrendResultsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/\S/)
  runId!: string;

  // 스크랩한 국가/시장 코드(예: KR, US, ID). 대소문자 무관하게 저장은 대문자 정규화.
  @IsString()
  @MinLength(2)
  @MaxLength(8)
  @Matches(/^[A-Za-z]{2,8}$/)
  region!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ExtensionTiktokCcTrendItemDto)
  items!: ExtensionTiktokCcTrendItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ExtensionTiktokCcTrendErrorDto)
  errors?: ExtensionTiktokCcTrendErrorDto[];
}
