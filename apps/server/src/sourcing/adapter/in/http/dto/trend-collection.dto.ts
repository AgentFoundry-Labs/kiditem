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

const TREND_COLLECT_SOURCES = ['naver', 'shorts', '1688'] as const;
type TrendCollectSourceValue = (typeof TREND_COLLECT_SOURCES)[number];

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
  @ArrayMaxSize(3)
  @IsIn(TREND_COLLECT_SOURCES, { each: true })
  sources?: TrendCollectSourceValue[];
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
  @ArrayMaxSize(3)
  @IsIn(TREND_COLLECT_SOURCES, { each: true })
  sources?: TrendCollectSourceValue[];

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
