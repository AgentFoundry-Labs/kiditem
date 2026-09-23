/**
 * 리스팅 대표이미지 평가 — 순수 규칙(KID-313 W3a). 평가 한 행은 (리스팅, 그 시점 이미지 URL) 하나에 붙는다.
 * 점수 → 등급 매핑과 "다시 평가할 이미지인가" 판정만 여기 있고, 점수를 내는 일은 vision provider 어댑터가 한다.
 */

export const LISTING_THUMBNAIL_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
export type ListingThumbnailGrade = (typeof LISTING_THUMBNAIL_GRADES)[number];

export const LISTING_THUMBNAIL_EVALUATION_METHODS = ['vision_model', 'rule'] as const;
export type ListingThumbnailEvaluationMethod = (typeof LISTING_THUMBNAIL_EVALUATION_METHODS)[number];

/** 0–100 점수를 등급으로. 경계는 옛 썸네일 분석과 같다(S 90 · A 80 · B 70 · C 60 · D 50). */
export function gradeForScore(score: number): ListingThumbnailGrade {
  if (!Number.isFinite(score)) return 'F';
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

/**
 * 몰이 보고한 현재 대표이미지에 평가가 없으면 평가할 대상이다. 같은 URL 에 이미 평가가 있으면 다시 하지
 * 않는다 — 이미지가 바뀌었을 때만 새 행이 생긴다.
 */
export function needsEvaluation(input: { currentImageUrl: string | null; evaluatedImageUrls: readonly string[] }): boolean {
  if (!input.currentImageUrl) return false;
  return !input.evaluatedImageUrls.includes(input.currentImageUrl);
}
