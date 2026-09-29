/**
 * 몰 → 셀피아 판매처 이름(부분일치, 대소문자 무시). 셀피아 송장재출력·대기목록의 판매처명 기준(라이브 확인). 웹(송장 몰별
 * 필터·CSV·셀피아 대조)과 서버(송장 업로드 kind의 plan이 그 몰 행을 고를 때)가 같은 표를 쓴다 — KID-355 wave8b에서 웹 사본을
 * 여기로 옮겼다. 새 몰은 여기 한 곳에만 더한다.
 */
export const SELLPIA_PROVIDER_BY_MALL: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'icecream-mall': ['아이스크림몰'],
  'teacher-mall': ['테크빌', '키즈티쳐'], // 테크빌교육(키즈티쳐몰)
  kidsnote: ['키즈노트'],
  onch: ['온채널'],
  art09: ['아트공구'],
  boribori: ['보리보리'],
  domeggook: ['도매꾹'],
  'lotte-on': ['롯데온', '롯데on'],
  kkomangse: ['꼬망세'],
  kakao: ['카카오'],
  'coupang-direct': ['쿠팡-직배송', '쿠팡직배송'],
  'gs-shop': ['gs샵'],
  kidkids: ['키드키즈'], // 아직 셀피아 송장 미확인(발송 시 매핑)
  'haebub-mall': ['해법몰'], // 아직 셀피아 송장 미확인(발송 시 판매처명 확인 필요)
  always: ['올웨이즈', '이레빗'],
});

/** 셀피아 판매처명을 아는 몰인가(송장 몰별 필터·업로드 버튼 가드). */
export function isSellpiaProviderMall(mallKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(SELLPIA_PROVIDER_BY_MALL, mallKey);
}

/** 셀피아 판매처명이 어느 몰인가(부분일치, 대소문자 무시). 모르면 null. */
export function resolveMallKeyFromSellpiaProvider(provider: string | null | undefined): string | null {
  const value = (provider ?? '').toLowerCase();
  if (!value) return null;
  for (const [mallKey, keys] of Object.entries(SELLPIA_PROVIDER_BY_MALL)) {
    if (keys.some((key) => value.includes(key.toLowerCase()))) return mallKey;
  }
  return null;
}

/** 판매처명이 이 몰 것인가. */
export function sellpiaProviderMatchesMall(provider: string | null | undefined, mallKey: string): boolean {
  const keys = SELLPIA_PROVIDER_BY_MALL[mallKey];
  if (!keys) return false;
  const value = (provider ?? '').toLowerCase();
  return keys.some((key) => value.includes(key.toLowerCase()));
}
