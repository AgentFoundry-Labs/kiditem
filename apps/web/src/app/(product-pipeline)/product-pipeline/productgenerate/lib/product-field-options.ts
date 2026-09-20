/**
 * 상품 등록 초안의 고를거리 — 우리가 실제로 쓰던 값이다(2026-09-20 판매상품 773개에서 뽑음).
 *
 * 고르기도 되고 직접 적기도 된다. 사방넷에서 옮겨온 값에는 같은 뜻의 표기가 여럿 섞여 있어(해피프랜즈 · 해피프렌즈,
 * `어린이제품[안전확인]` · `[어린이제품]안전확인`) 대표 표기 하나로 모았다.
 */

/** 브랜드 — kiditem 769개 · 노브랜드 3개. */
export const BRAND_OPTIONS = ['kiditem', '노브랜드'] as const;

/** 제조사 — 해피프랜즈 331(해피프렌즈 표기 포함) · KY I&D 254 · 나머지는 매입처 이름. */
export const MANUFACTURER_OPTIONS = [
  '해피프랜즈',
  'KY I&D',
  '(주)필박스',
  '(주)하늘빛',
  '펜피아',
  '오로라',
  '상일노트사',
  '스쿨디포에이치디에스',
] as const;

/** 원산지 — 중국 734(CHINA 포함) · 대한민국 39. */
export const ORIGIN_COUNTRY_OPTIONS = ['중국', '대한민국', '베트남'] as const;
export const DEFAULT_ORIGIN_COUNTRY = '중국';

/** KC 인증번호(`CB…`)를 발급한 시험기관. FITI 161 · KTC 32 · KCL 26 · KOTITI 35 · KATRI 11. */
export const CERTIFICATION_ISSUER_OPTIONS = [
  'FITI시험연구원',
  '한국기계전기전자시험연구원(KTC)',
  '한국건설생활환경시험연구원(KCL)',
  'KOTITI시험연구원',
  '한국의류시험연구원(KATRI)',
] as const;

/** 그 인증이 어느 제도인가. 우리 상품은 거의 전부 어린이제품 안전확인이다(270/281). */
export const CERTIFICATION_FIELD_OPTIONS = [
  '[어린이제품]안전확인',
  '[어린이제품]안전인증',
  '[어린이제품]공급자적합성확인',
] as const;
