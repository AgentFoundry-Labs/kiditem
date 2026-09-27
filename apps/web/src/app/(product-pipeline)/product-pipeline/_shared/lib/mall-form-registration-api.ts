import {
  prepareSavedDetailImage,
  requireRenderedDetailImage,
} from '../../collected-products/lib/detail-page-image-api';
import { productsApi } from '../../collected-products/lib/sourcing-api';
import {
  candidateToMallProductDraft,
  KIDITEM_MALL_DRAFT_DEFAULTS,
  mallProductDraftGaps,
  type MallProductDraft,
} from './mall-product-draft';
import type { ChannelKey } from '@kiditem/shared/channel-registry';

/**
 * 몰 등록 폼 지시 만들기(KID-364·256).
 *
 * 몰마다 폼 빌더(`*-registration-form.ts`)가 초안과 몰 값으로 폼 지시를 만들고, 그 지시가 등록 실행 scope의
 * `form`으로 서버에 얼려진다. 확장 몰 쓰기 모듈은 몰 키로 어느 화면을 열고 어느 칸을 채울지 정한다 — 웹은 몰별 주소를
 * 확장에 따로 넘기지 않고, 확장을 직접 부르지도 않는다. 실행 시작은 `(channels)/_shared/registration-operation.ts` 하나다.
 */

/**
 * 몰 키. 확장 몰 쓰기 사이트 키도, 저장된 계정 키도 같은 값이다(레지스트리 철자). 실제로 쓰기 사이트가 있는 몰은
 * 확장이 `mallWriteSite.<key>`로 알린다 — 레지스트리 행에서는 가려낼 수 없다.
 */
export type MallFormRegisterMall = ChannelKey;

/** 확장에 넘기는 폼 지시. 몰마다 모양이 달라 최소 계약만 요구한다. */
export interface MallRegistrationFormPayload {
  url: string;
  manualSteps: string[];
}

/**
 * 초안이 비어 있으면 폼 지시를 만들지 않는다 — 반쯤 빈 폼이 열리면 사람이 그걸 그대로 제출할 수 있고, 그건 우리가 만든
 * 사고다. 비지 않았으면 빌더가 만든 지시를 그대로 돌려준다.
 */
export function checkedMallForm<Form extends MallRegistrationFormPayload>(draft: MallProductDraft, form: Form): Form {
  const gaps = mallProductDraftGaps(draft);
  if (gaps.length > 0) {
    throw new Error(`"${draft.displayName}" 등록 준비가 끝나지 않았습니다 — ${gaps.join(' ')}`);
  }
  return form;
}

/**
 * 수집상품 하나를 몰에 보낼 초안으로 만든다.
 *
 * 상세설명은 저장된 상세페이지를 이미지 1장으로 렌더해서 쓴다. 없으면 여기서
 * 멈춘다 — 대표이미지나 수집 원본으로 대체하지 않는다.
 */
export async function prepareMallRegistration(
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
