import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// 서버가 POST /collect 로 직접 수집하는 소스. tiktok-cc 는 봇/리전 차단으로
// 확장 스크랩 전용이라 서버 수집 대상에서는 제외한다.
const TREND_COLLECT_SOURCES = ['naver', 'shorts', '1688'] as const;
type TrendCollectSourceValue = (typeof TREND_COLLECT_SOURCES)[number];

// 시드에 태깅 가능한 소스(확장 스크랩 전용 tiktok-cc 포함).
const TREND_SEED_SOURCES = ['naver', 'shorts', '1688', 'tiktok-cc'] as const;
type TrendSeedSourceValue = (typeof TREND_SEED_SOURCES)[number];

export class CollectTrendDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(TREND_COLLECT_SOURCES, { each: true })
  sources?: TrendCollectSourceValue[];
}

export class UpsertTrendSeedDto {
  @IsString()
  @MaxLength(80)
  keyword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  keywordCn?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(TREND_SEED_SOURCES, { each: true })
  sources?: TrendSeedSourceValue[];
}

export class UpdateTrendSeedDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  keywordCn?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(TREND_SEED_SOURCES, { each: true })
  sources?: TrendSeedSourceValue[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class TrendHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
