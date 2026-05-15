import { thumbnailGenerationEditHref } from '../../../_shared/lib/product-pipeline-routes';
import { getThemeHint } from './theme-hint';

export function buildEditHref(opts: {
  productId?: string | null;
  sourceCandidateId?: string | null;
  imageUrl?: string | null;
  generationId?: string;
  /**
   * 상품명 — productName 받으면 자동으로 theme 추출 → hint 텍스트가 query 에 추가됨.
   * /product-pipeline/thumbnail-generation/edit 페이지가 hint 받아서 "편집 지시사항" textarea 에 prefill.
   * 사용자가 그대로 두거나 수정하고 "편집하기" 누르면 사용자 instruction 으로 backend 전달.
   *
   * 예: productName = "LED 산타트리 크리스마스" → hint = "크리스마스 분위기로 연출..."
  */
  productName?: string | null;
  returnTo?: string | null;
}): string {
  const href = thumbnailGenerationEditHref({
    generationId: opts.generationId,
    imageUrl: opts.imageUrl,
    productName: opts.productName,
    returnTo: opts.returnTo,
    subjectParams: {
      productId: opts.productId,
      sourceCandidateId: opts.sourceCandidateId,
    },
  });

  // Theme hint 자동 추출 — productName 에 시즈널/조명 키워드 있으면 추가.
  const hint = getThemeHint(opts.productName);
  if (!hint) return href;

  const [pathname, rawQuery = ''] = href.split('?');
  const params = new URLSearchParams(rawQuery);
  params.set('hint', hint);
  return `${pathname}?${params.toString()}`;
}
