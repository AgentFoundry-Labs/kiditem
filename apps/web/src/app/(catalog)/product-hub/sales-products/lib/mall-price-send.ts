/**
 * 몰 가격 보내기(KID-247)의 몰별 사실. 보내기 자체는 등록 실행(`update` + `salePrice`, `mall-price-execution.ts`)이다 —
 * 확장 몰 쓰기 모듈이 그 몰 관리자에 보내고 다시 읽는다. 보냈다와 몰에서 확인했다는 다르다.
 */

/** 가격을 보낼 수 있는 몰(확장 몰 쓰기 모듈의 가격 sender가 있는 몰). */
export const MALL_PRICE_SEND_MALLS = ['kakao', 'kidsnote'] as const;

export function canSendMallPrice(mallKey: string): boolean {
  return (MALL_PRICE_SEND_MALLS as readonly string[]).includes(mallKey);
}

/**
 * 가격을 바꾸면 몰이 따로 하는 일 — 보내기 전 확인 단계에 그대로 보인다. 키즈노트는 화면 문구 그대로(사장님 2026-09-20:
 * 붙이되 경고, 시험은 다음 실제 가격 변경 때).
 */
export const MALL_PRICE_SEND_NOTE: Readonly<Record<string, string>> = {
  kidsnote: '키즈노트는 가격을 바꾸면 본사 승인 전까지 그 상품 판매가 멈춥니다.',
};

/** 같은 가격을 다시 보내면 안 되는 몰 — 보내는 것만으로 판매가 멈추는 몰은 가격이 다를 때만 보낸다. */
export function mallPriceResendAllowed(mallKey: string): boolean {
  return !MALL_PRICE_SEND_NOTE[mallKey];
}
