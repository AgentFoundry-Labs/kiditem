/**
 * 상품명 → 자동 thematic hint 텍스트.
 *
 * AI 편집하기 클릭 시 buildEditHref 가 productName 분석 → URL ?hint=... query 추가 →
 * /product-pipeline/thumbnail-generation/edit 페이지가 받아서 "편집 지시사항" 텍스트박스에 prefill.
 *
 * 사용자는 prefill 된 hint 를 그대로 두거나 수정해서 "편집하기" 누름 → backend 가
 * 사용자 instruction 으로 받아 GENERATE_PROMPT 위에 prepend.
 *
 * 결과: LED 산타트리 → 자동으로 "크리스마스 분위기, 거실 코너..." 가 prefill 됨.
 *
 * Theme priority (top-to-bottom, first match wins):
 *  1. Christmas (크리스마스/산타/트리/루돌프)
 *  2. Halloween (할로윈/호박/박쥐)
 *  3. Valentine (발렌타인/사랑/커플)
 *  4. Party / Birthday (생일/파티)
 *  5. Camping / Outdoor (캠핑/야외/정원)
 *  6. Wedding (웨딩/결혼)
 *  7. Lighting (LED/전구/램프/조명/줄조명) — generic interior mood
 *  8. (no match) → null = no prefill
 */

export type ThemeKind =
  | 'christmas'
  | 'halloween'
  | 'valentine'
  | 'party'
  | 'camping'
  | 'wedding'
  | 'lighting'
  | null;

const THEME_PATTERNS: Array<{ kind: NonNullable<ThemeKind>; patterns: string[] }> = [
  {
    kind: 'christmas',
    patterns: [
      '크리스마스',
      '성탄',
      '산타',
      '루돌프',
      '눈사람',
      '캐롤',
      'christmas',
      'santa',
      'xmas',
      '크리스',
    ],
  },
  {
    kind: 'halloween',
    patterns: ['할로윈', '호박', '박쥐', '유령', '고스트', '마녀', 'halloween', 'pumpkin'],
  },
  {
    kind: 'valentine',
    patterns: ['발렌타인', '커플', '연인', 'valentine', '하트모양', '하트장식'],
  },
  {
    kind: 'party',
    patterns: ['생일', '파티', '축하', '풍선', 'party', 'birthday'],
  },
  {
    kind: 'camping',
    patterns: ['캠핑', 'camping', '야외', 'outdoor', '정원', 'garden', '테라스', '랜턴'],
  },
  {
    kind: 'wedding',
    patterns: ['웨딩', '결혼', 'wedding'],
  },
  {
    kind: 'lighting',
    // generic lighting — Christmas / Halloween 등 매칭 안 된 후 fallback
    patterns: [
      'LED',
      '전구',
      '램프',
      '조명',
      '무드등',
      '야간등',
      '취침등',
      '간접조명',
      '장식등',
      '줄조명',
      '스트링라이트',
      'string light',
      'fairy light',
      'night light',
      'mood light',
      'lamp',
      'bulb',
      'lantern',
      'glow',
    ],
  },
];

/**
 * Lighting 카테고리 키워드 — productName 에 반드시 포함되어야 thematic hint 적용.
 *
 * 사장 정책: "이미지마다 필요한 배경이 잇고, 그러잖아" — 사용자가 직접 적는 게 원칙.
 * 단 LED / 조명 상품은 무드 컷이 default 라 자동 hint 만 적용.
 *
 * 즉 "산타피규어" 처럼 LED 없는 일반 상품 → no hint (사용자 직접 입력).
 *    "LED 산타트리" 처럼 LED + 크리스마스 → christmas hint.
 *    "LED 무드등" → generic lighting hint.
 */
const LIGHTING_PATTERNS = [
  'LED',
  '전구',
  '램프',
  '조명',
  '무드등',
  '야간등',
  '취침등',
  '간접조명',
  '장식등',
  '줄조명',
  '스트링라이트',
  'string light',
  'fairy light',
  'night light',
  'mood light',
  'lamp',
  'bulb',
  'lantern',
  'glow',
  '라이트', // "라이트반지" 같은 케이스 포함
];

/** productName 에 lighting 키워드가 포함되어 있는지 검사. */
function hasLightingKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return LIGHTING_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * productName 에서 theme 자동 추출.
 *
 * **사장 정책: 크리스마스 + LED 한정** — "내가 크리스마스 말고는 배경 만들라고
 * 한 적이 없다". 즉 자동 prefill 은 lighting + christmas 조합에만. 그 외 모든
 * 상품 (할로윈, 일반 LED 무드등, 일반 상품 등) 은 사용자가 직접 textarea 에 적어야.
 *
 * 다음 두 조건 모두 만족할 때만 hint:
 *  1. lighting 키워드 (LED/전구/램프/조명/무드등/...)
 *  2. christmas 키워드 (크리스마스/산타/트리/루돌프/...)
 */
export function detectTheme(productName: string | null | undefined): ThemeKind {
  if (!productName) return null;

  // 조건 1: lighting 키워드 필수
  if (!hasLightingKeyword(productName)) return null;

  // 조건 2: christmas 키워드 필수
  const lower = productName.toLowerCase();
  const christmasTheme = THEME_PATTERNS.find((t) => t.kind === 'christmas');
  if (!christmasTheme) return null;
  const hasChristmas = christmasTheme.patterns.some((p) => lower.includes(p.toLowerCase()));
  if (!hasChristmas) return null;

  return 'christmas';
}

/** Theme → 한국어 prefill hint 문장. backend 에 사용자 instruction 으로 전달됨. */
const THEME_HINTS: Record<NonNullable<ThemeKind>, string> = {
  christmas:
    '크리스마스 분위기로 연출해주세요. 어두운 거실 코너에 작은 트리와 선물 박스, 따뜻한 줄조명 보케 배경. 사실적인 인테리어 사진 룩 (CGI 아닌 실제 카메라 톤). 상품의 빛은 켜진 상태로 자연스럽게 강조.',
  halloween:
    '할로윈 분위기로 연출해주세요. 어두운 테이블 위 카브 호박과 박쥐 데코, 어두운 보라/오렌지 톤 배경. 사실적인 인테리어 사진 룩.',
  valentine:
    '로맨틱한 발렌타인 분위기로 연출해주세요. 침실 사이드 테이블에 작은 하트 쿠션과 장미꽃 한 송이, 부드러운 핑크 앰비언트 라이트. 사실적인 인테리어 사진 룩.',
  party:
    '파티/생일 분위기로 연출해주세요. 거실 코너에 작은 케이크와 풍선, 종이 컨페티가 있는 따뜻한 dim 무드. 사실적인 인테리어 사진 룩.',
  camping:
    '캠핑/야외 분위기로 연출해주세요. 캠핑 텐트가 보이는 잔잔한 달빛 배경, 풀과 솔방울이 자연스럽게 깔린 evening tone. 사실적인 풍경 사진 룩.',
  wedding:
    '웨딩 분위기로 연출해주세요. 화이트-골드 톤 인테리어, 우아한 꽃장식과 sheer 패브릭 드레이프. 사실적인 인테리어 사진 룩.',
  lighting:
    '사실적 인테리어 무드 컷으로 연출해주세요. 침실 사이드 테이블 / 책상 / 거실 코너 중 자연스러운 곳에 놓인 상품 + 조명 켜진 상태 + 자연스러운 보케 배경. CGI/판타지 아닌 실제 카메라 사진 룩.',
};

/**
 * productName → prefill hint 텍스트. 매치 없으면 빈 문자열.
 *
 * 사용 예:
 *   const hint = getThemeHint("LED 산타트리 크리스마스 트리장식")
 *   // → "크리스마스 분위기로 연출해주세요. 어두운 거실 코너에..."
 */
export function getThemeHint(productName: string | null | undefined): string {
  const theme = detectTheme(productName);
  if (!theme) return '';
  return THEME_HINTS[theme];
}
