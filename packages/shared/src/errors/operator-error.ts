import { ERROR_DEFINITIONS, resolveErrorCode, type KiditemErrorCode } from './definitions.js';

/** 원천 식별자 → 운영자에게 보이는 이름. 모르는 원천은 "수집". 새 원천은 여기 한 줄. */
export const SOURCE_LABELS: Readonly<Record<string, string>> = {
  coupang_wing_catalog: 'Wing 상품 목록 수집',
  coupang_wing_traffic: 'Wing 트래픽 수집',
  coupang_ad_campaign: '광고 캠페인 수집',
  coupang_ad_keyword: '광고 키워드 수집',
  coupang_itemwinner: '아이템위너 수집',
  coupang_review: '쿠팡 리뷰 수집',
  coupang_direct_order: '쿠팡 직배송 주문 수집',
  rocket_po: '로켓 발주 수집',
  order_collection: '주문 수집',
  sellpia_inventory: '셀피아 재고 수집',
  sellpia_sales: '셀피아 매출 수집',
  sellpia_profitability: '셀피아 수익성 수집',
  sellpia_shipment_tracking: '셀피아 배송 추적',
  sellpia_manual_match: '셀피아 수동 매칭',
  competitor_catalog: '경쟁사 상품 수집',
  wing_tracked_product: 'Wing 추적 상품 수집',
  wing_rank: 'Wing 순위 수집',
  keyword_serp: '키워드 검색 결과 수집',
  sourcing_browser: '소싱 수집',
};

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return '수집';
  return SOURCE_LABELS[source] ?? SOURCE_LABELS[source.toLowerCase().replace(/[-\s]+/g, '_')] ?? '수집';
}

export interface OperatorErrorInput {
  /** 서버·확장이 보낸 코드. 등록 코드·alias·소문자 철자 모두 받는다. */
  readonly code: unknown;
  /** 원천 식별자(`sourceType` 등). 모르는 코드일 때 일반 문장의 주어가 된다. */
  readonly source?: string | null;
}

/**
 * 운영자에게 보이는 오류 문장 하나. 알려진 코드는 레지스트리 문장, 모르는 코드는 원천별 일반 문장.
 * 원문(`errorMessage`)은 절대 돌려주지 않는다 — 그것이 영어·변수명이 화면에 새던 경로다.
 */
export function operatorErrorText(input: OperatorErrorInput): string {
  const code = resolveErrorCode(input.code);
  if (code) return ERROR_DEFINITIONS[code].text;
  return `${sourceLabel(input.source)} 작업이 실패했습니다. 다시 시도해 주세요.`;
}

/** 코드를 풀어 `{ code, text }`를 낸다. 모르는 코드는 `code: null`. 화면이 kind로 분기할 때 쓴다. */
export function describeOperatorError(input: OperatorErrorInput): { code: KiditemErrorCode | null; text: string } {
  const code = resolveErrorCode(input.code);
  return { code, text: operatorErrorText(input) };
}
