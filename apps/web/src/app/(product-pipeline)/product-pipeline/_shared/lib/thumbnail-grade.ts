import type { ListingThumbnailEvaluation } from '@kiditem/shared/product-content';

type ListingThumbnailGrade = ListingThumbnailEvaluation['grade'];

/** 리스팅 대표이미지 평가 등급의 배경 색(S 가 가장 좋다). */
export const LISTING_THUMBNAIL_GRADE_BG: Record<ListingThumbnailGrade, string> = {
  S: 'bg-emerald-500',
  A: 'bg-blue-500',
  B: 'bg-amber-500',
  C: 'bg-orange-500',
  D: 'bg-rose-500',
  F: 'bg-red-600',
};

export const LISTING_THUMBNAIL_GRADES: readonly ListingThumbnailGrade[] = ['S', 'A', 'B', 'C', 'D', 'F'];
