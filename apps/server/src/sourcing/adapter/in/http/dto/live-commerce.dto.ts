import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

const LIVE_COMMERCE_SOURCES = ['taobao', '1688', 'douyin'] as const;
const EXTENSION_LIVE_COMMERCE_SOURCES = ['1688', 'douyin'] as const;
const INT4_MAX = 2_147_483_647;

export class CollectTaobaoLiveDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/)
  queryDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  liveIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize?: number;
}

export class LiveCommerceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;

  @IsOptional()
  @IsIn(LIVE_COMMERCE_SOURCES)
  source?: (typeof LIVE_COMMERCE_SOURCES)[number];
}

export class ExtensionLiveCommerceBroadcastDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  broadcastId!: string;

  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsString() @MaxLength(128) broadcasterId?: string;
  @IsOptional() @IsString() @MaxLength(200) broadcasterName?: string;
  @IsOptional() @IsString() @MaxLength(64) status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(INT4_MAX) viewerCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(INT4_MAX) likeCount?: number;
  @IsOptional() @IsString() @MaxLength(64) startedAt?: string;
  @IsOptional() @IsString() @MaxLength(64) endedAt?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2_048) coverImageUrl?: string;
}

export class ExtensionLiveCommerceProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  productId!: string;

  @IsOptional() @IsInt() @Min(1) @Max(100) rank?: number;
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(1_000_000_000) priceCny?: number;
  @IsOptional() @IsInt() @Min(0) @Max(INT4_MAX) salesCount?: number;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2_048) imageUrl?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2_048) sourceUrl?: string;
}

export class IngestExtensionLiveCommerceDto {
  @IsIn(EXTENSION_LIVE_COMMERCE_SOURCES)
  source!: (typeof EXTENSION_LIVE_COMMERCE_SOURCES)[number];

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2_048)
  pageUrl!: string;

  @ValidateNested()
  @Type(() => ExtensionLiveCommerceBroadcastDto)
  broadcast!: ExtensionLiveCommerceBroadcastDto;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExtensionLiveCommerceProductDto)
  products!: ExtensionLiveCommerceProductDto[];
}
