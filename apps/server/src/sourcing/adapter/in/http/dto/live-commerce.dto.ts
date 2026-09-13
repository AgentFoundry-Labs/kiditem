import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const LIVE_COMMERCE_SOURCES = ['taobao', '1688', 'douyin'] as const;

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

export class TaobaoLiveRequestDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Matches(/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/)
  queryDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  })
  @IsArray()
  @IsString({ each: true })
  liveIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
