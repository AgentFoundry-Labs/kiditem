import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { THUMBNAIL_TRACKING_STATUSES, type ThumbnailTrackingStatus } from '@kiditem/shared';

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

  @IsOptional()
  @IsIn(THUMBNAIL_TRACKING_STATUSES)
  status?: ThumbnailTrackingStatus;
}
