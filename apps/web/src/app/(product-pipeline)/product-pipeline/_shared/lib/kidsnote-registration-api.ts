import {
  prepareSavedDetailImage,
  requireRenderedDetailImage,
} from '../../collected-products/lib/detail-page-image-api';
import { productsApi } from '../../collected-products/lib/sourcing-api';
import {
  candidateToMallProductDraft,
  KIDITEM_MALL_DRAFT_DEFAULTS,
  type MallProductDraft,
} from './mall-product-draft';

/**
 * 키즈노트 등록 초안. 폼 지시는 `kidsnoteFormFromDraft`가 만들고, 등록 실행(`channels.registration`)이 그 지시를
 * 확장 몰 쓰기 모듈에 넘긴다(KID-364·256). 키즈노트도 몰 하나다 — 따로 확장을 부르지 않는다.
 */

/**
 * 수집상품 하나를 키즈노트에 보낼 초안으로 만든다.
 *
 * 상세설명은 저장된 상세페이지를 이미지 1장으로 렌더해서 쓴다. 없으면 여기서
 * 멈춘다 — 대표이미지나 수집 원본으로 대체하지 않는다. 잘못된 상세페이지가
 * 등록되는 것이 등록을 멈추는 것보다 나쁘다.
 */
export async function prepareKidsnoteRegistration(
  salesProductId: string,
): Promise<{ draft: MallProductDraft; detailImageUrl: string }> {
  const detail = await productsApi.getDetail(salesProductId);
  const rendered = await prepareSavedDetailImage(detail);
  const detailImageUrl = requireRenderedDetailImage(rendered);
  const draft = candidateToMallProductDraft({
    detail,
    defaults: KIDITEM_MALL_DRAFT_DEFAULTS,
    detailImageUrl,
  });
  return { draft, detailImageUrl };
}
