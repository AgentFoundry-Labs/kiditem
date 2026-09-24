/**
 * 쿠팡 어댑터가 등록 실행 준비에서 영어로 돌려주는 거절을 사람 말로 옮긴다.
 *
 * 규칙을 풀지는 않는다 — 무엇이 막혔고 다음에 무엇을 보면 되는지만 말한다. 모르는 문구는 그대로 둔다.
 */
const WING_ERROR_TRANSLATIONS: readonly { match: RegExp; message: string }[] = [
  {
    match: /Wing registration registers exactly one option/i,
    message: '쿠팡 WING 등록은 옵션 하나만 올립니다. 등록 대상에서 옵션 하나만 고른 뒤 다시 시도하세요.',
  },
  {
    match: /Wing registration registers exactly one variant/i,
    message: '쿠팡 WING 등록은 구매옵션 한 줄만 올립니다. 저장된 WING 값의 옵션을 하나로 줄이세요.',
  },
  {
    match: /Wing registration requires an account with a vendor identity/i,
    message: '이 쿠팡 계정에 판매자 ID(vendorId)가 없습니다. 쇼핑몰 계정 설정에서 판매자 ID를 먼저 넣으세요.',
  },
  {
    match: /KID must be issued for the option before a Wing registration/i,
    message: '등록할 옵션에 KID 가 아직 없습니다. 판매상품에서 판매를 확정해 KID 를 받은 뒤 다시 시도하세요.',
  },
];

export function translateWingError(detail: string): string {
  const hit = WING_ERROR_TRANSLATIONS.find((entry) => entry.match.test(detail));
  return hit ? hit.message : detail;
}
