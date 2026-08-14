import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

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
