// apps/server/src/orders/dto/list-reviews.dto.ts
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const REVIEW_FILTERS = ['all', 'new', 'needs-response'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export class ListReviewsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsIn(REVIEW_FILTERS)
  filter?: ReviewFilter;
}
