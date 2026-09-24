// apps/server/src/orders/adapter/in/web/dto/list-review-items.dto.ts
import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/** 개별 상품평 열람(`GET /api/reviews/items`) 쿼리. */
export class ListReviewItemsQueryDto {
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

  /** 특정 상품(listing)의 리뷰만. 집계 테이블에서 상품을 클릭했을 때 쓴다. */
  @IsOptional()
  @IsUUID()
  listingId?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /** 'true' 면 본문/제목이 있는 리뷰만. 쿠팡은 별점만 남기는 리뷰가 대부분이다. */
  @IsOptional()
  @IsBooleanString()
  hasContent?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
