import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { THUMBNAIL_TRACKING_STATUSES, type ThumbnailTrackingStatus } from '@kiditem/shared/ai';

export class ListTrackingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  /** Filters by the status derived from the inconclusive mark and the CTR before and after. */
  @IsOptional()
  @IsIn(THUMBNAIL_TRACKING_STATUSES)
  status?: ThumbnailTrackingStatus;
}

export class UpdateMetricsDto {
  @IsOptional()
  @IsNumber()
  ctrBefore?: number;

  @IsOptional()
  @IsNumber()
  ctrAfter?: number;

  @IsOptional()
  @IsNumber()
  reviewsBefore?: number;

  @IsOptional()
  @IsNumber()
  reviewsAfter?: number;

  @IsOptional()
  @IsNumber()
  salesBefore?: number;

  @IsOptional()
  @IsNumber()
  salesAfter?: number;

  /** true marks the tracking 결론 없음 and keeps an earlier mark's time; false clears the mark. */
  @IsOptional()
  @IsBoolean()
  inconclusive?: boolean;
}
