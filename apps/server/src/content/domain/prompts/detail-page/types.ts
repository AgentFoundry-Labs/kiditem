import type {
  DetailImageCount,
  DetailPageAgeGroup,
} from '@kiditem/shared/ai';

export type {
  DetailImageCount,
  DetailPageAgeGroup,
} from '@kiditem/shared/ai';

/**
 * Detail Page Prompt — Common Types
 *
 * 11 개 섹션 LLM 호출의 공통 입력 / 누적 상태.
 * 1688/Alibaba raw 데이터 + 이전 섹션 산출물.
 */

/** 1688/Alibaba 스크래퍼가 넘기는 raw 제품 입력. */
export interface RawProductInput {
  /** 원문 제품명 (한자/영어 가능) */
  rawTitle: string;
  /** 원문 카테고리 (한자/영어 가능) */
  rawCategory: string;
  /** 원문 상품 설명 */
  rawDescription: string;
  /** 옵션/스펙 요약 (옵션명·색상·사이즈 등) */
  rawOptions: string;
  /** 이미지 URL 후보 (인덱스 = 배열 순서) */
  imageUrls: string[];
  /** 상세페이지 사용 연령 기준. 기본은 age-8-plus. */
  ageGroup?: DetailPageAgeGroup;
  /** DETAIL 본문 이미지 수. 기본 2개. 기존 auto payload도 2개로 처리한다. */
  detailImageCount?: DetailImageCount;
  /** 사용법 안내 영역 생성 여부. 기본 include. */
  usageSectionMode?: UsageSectionMode;
  /** KC 인증번호 입력 상태. 기본 unknown = AI 판단. */
  kcCertificationStatus?: KcCertificationStatus;
  /** 사용자가 직접 입력한 KC 인증번호. */
  kcCertificationNumber?: string;
}

export type UsageSectionMode = 'include' | 'exclude';
export type KcCertificationStatus = 'unknown' | 'none' | 'exists';
export type ProductUseType =
  | 'stationery'
  | 'slime_squishy'
  | 'water_bubble'
  | 'electronic_light_sound'
  | 'diy_craft'
  | 'keyring_fidget'
  | 'block_puzzle_game'
  | 'outdoor_sports'
  | 'roleplay_figure_doll'
  | 'bag_accessory_lifestyle'
  | 'seasonal_party'
  | 'snack_food_shape'
  | 'generic_toy_misc';

export interface ProductUseProfile {
  primary: ProductUseType;
  secondary: ProductUseType[];
  label: string;
  usageFlow: string[];
  imageFlow: string[];
  avoid: string[];
}

const PRODUCT_USE_TYPE_LABELS: Record<ProductUseType, string> = {
  stationery: '문구/필기·꾸미기',
  slime_squishy: '슬라임/말랑이·촉감놀이',
  water_bubble: '물총/비눗방울·야외놀이',
  electronic_light_sound: 'LED/전동/소리·작동형 완구',
  diy_craft: 'DIY/만들기·키우기',
  keyring_fidget: '키링/피젯·휴대 소품',
  block_puzzle_game: '블록/퍼즐/게임',
  outdoor_sports: '줄넘기/캐치볼·활동놀이',
  roleplay_figure_doll: '역할놀이/인형·피규어',
  bag_accessory_lifestyle: '가방/목걸이·생활소품',
  seasonal_party: '시즌/파티 소품',
  snack_food_shape: '간식/캔디형 상품',
  generic_toy_misc: '일반 완구/잡화',
};

const PRODUCT_USE_PATTERNS: Record<ProductUseType, RegExp[]> = {
  stationery: [
    /문구|펜|볼펜|연필|샤프|지우개|사인펜|싸인펜|형광펜|메모|메모보드|노트|수첩|필통|스티커|테이프|색연필|크레파스|파일|필기/i,
  ],
  slime_squishy: [
    /슬라임|말랑|말랑이|주물럭|스퀴시|촉감|쫀득|왁스팝|젤리팝|푸딩|putty|slime|squishy/i,
  ],
  water_bubble: [
    /비눗방울|버블건|버블|물총|워터건|물놀이|water\s*gun|bubble/i,
  ],
  electronic_light_sound: [
    /led|전동|rc|리모컨|무선|라이트|무드등|조명|발광|게임기|lcd|배터리|건전지|터치|오르골|음악|소리|탬버린|댄싱|충전/i,
  ],
  diy_craft: [
    /diy|만들기|키우기|마리모|잔디인형|십자수|클레이|비누만들기|공예|팩토리|조립|꾸미기세트/i,
  ],
  keyring_fidget: [
    /키링|키홀더|열쇠고리|클릭|스피너|피젯|팝잇|푸시팝|스트레스볼/i,
  ],
  block_puzzle_game: [
    /블록|퍼즐|게임|보드게임|미로|자석미로|파이프게임|큐브/i,
  ],
  outdoor_sports: [
    /줄넘기|캐치볼|스포츠|공놀이|야외|글라이더|낙하산|팽이|공\b/i,
  ],
  roleplay_figure_doll: [
    /병원놀이|공구놀이|소꿉|주방놀이|역할놀이|인형|피규어|동물피규어|캐릭터인형/i,
  ],
  bag_accessory_lifestyle: [
    /가방|파우치|목걸이|팔찌|반지|머리띠|악세사리|액세서리|스트랩/i,
  ],
  seasonal_party: [
    /크리스마스|할로윈|산타|트리|파티|소원돌|데코|장식/i,
  ],
  snack_food_shape: [
    /캔디|젤리|사탕|초콜릿|과자|스낵|쿠키/i,
  ],
  generic_toy_misc: [],
};

const PRODUCT_USE_PRIORITY: ProductUseType[] = [
  'stationery',
  'slime_squishy',
  'water_bubble',
  'electronic_light_sound',
  'diy_craft',
  'keyring_fidget',
  'block_puzzle_game',
  'outdoor_sports',
  'roleplay_figure_doll',
  'bag_accessory_lifestyle',
  'seasonal_party',
  'snack_food_shape',
];

const PRODUCT_USE_GUIDANCE: Record<
  ProductUseType,
  Pick<ProductUseProfile, 'usageFlow' | 'imageFlow' | 'avoid'>
> = {
  stationery: {
    usageFlow: ['구성/디자인 확인', '필기·꾸미기·정리에 사용', '필통이나 책상에 보관'],
    imageFlow: ['필기면, 손에 쥔 사용 컷, 구성품 정렬 컷을 우선', '색상/캐릭터 인쇄가 읽히는 정돈된 컷'],
    avoid: ['물놀이·슬라임처럼 과장하지 말 것', '비누 지우개는 비누가 아니라 지우개 사용 흐름으로 쓸 것'],
  },
  slime_squishy: {
    usageFlow: ['포장/용기 확인', '내용물이나 말랑한 본체를 손으로 만지고 누르기', '놀이 후 먼지 붙지 않게 보관'],
    imageFlow: ['손으로 만지는 대상은 슬라임/말랑이 본체만', '용기·뚜껑은 옆에 두거나 가볍게 잡는 보조물로 표현'],
    avoid: [
      '슬라임을 물·주스·시럽 같은 액체로 만들지 말 것',
      '붓기·쏟기·흐르기·튀기기 장면 금지',
      '플라스틱 용기·뚜껑·케이스를 주무르거나 변형하지 말 것',
    ],
  },
  water_bubble: {
    usageFlow: ['물 또는 비눗방울 용액 준비', '야외에서 버튼/방아쇠로 사용', '사용 후 물기 제거 및 세워 보관'],
    imageFlow: ['야외 사용 장면, 분사 방향, 버튼/방아쇠 조작 컷', '실내 침구·책상 위 물 튐 장면은 피함'],
    avoid: ['슬라임/촉감놀이 어휘를 섞지 말 것', '전동 상품은 전원부에 물이 닿는 표현 금지'],
  },
  electronic_light_sound: {
    usageFlow: ['전원/건전지/버튼 확인', '불빛·소리·움직임 작동', '사용 후 전원을 끄고 보관'],
    imageFlow: ['버튼, 발광부, 움직이는 기능이 보이는 컷', '조명류는 실제 켜진 상태의 자연스러운 무드 컷'],
    avoid: ['배터리 없는 수동 상품처럼 쓰지 말 것', '과한 빛줄기나 마법 효과 금지'],
  },
  diy_craft: {
    usageFlow: ['구성품 확인', '만들기·꾸미기·키우기 순서 진행', '완성품 전시 또는 관리'],
    imageFlow: ['재료 펼침, 만드는 손, 완성품 비교 컷', '설명서가 있으면 사용법 영역으로 분리'],
    avoid: ['완성품만 보여주고 과정이 없는 사용법 금지', '어린 유아용 미술놀이처럼 낮은 연령으로 낮추지 말 것'],
  },
  keyring_fidget: {
    usageFlow: ['가방·열쇠·필통에 연결', '클릭·회전·누르기 등 손끝 놀이', '외출 후 분실되지 않게 보관'],
    imageFlow: ['가방 고리 연결 컷, 손에 든 작동 컷, 작은 크기감 컷'],
    avoid: ['물놀이/슬라임 사용 흐름으로 바꾸지 말 것', '실제보다 큰 장난감처럼 과장하지 말 것'],
  },
  block_puzzle_game: {
    usageFlow: ['구성품 확인', '맞추기·쌓기·규칙대로 놀이', '완성 후 정리'],
    imageFlow: ['조립 전 구성, 진행 중 손, 완성 모습'],
    avoid: ['버튼 작동형 전자완구처럼 쓰지 말 것', '완성품이 원본과 다른 형태로 바뀌지 않게 할 것'],
  },
  outdoor_sports: {
    usageFlow: ['공간 확보', '손목/몸을 움직여 놀이', '사용 후 정리·보관'],
    imageFlow: ['야외 또는 넓은 실내 활동 컷, 잡는 손, 움직임 방향'],
    avoid: ['작은 책상 위 문구처럼 표현하지 말 것', '위험한 속도감·충돌 장면 금지'],
  },
  roleplay_figure_doll: {
    usageFlow: ['구성품 확인', '상황극 또는 캐릭터 놀이', '놀이 후 부품 정리'],
    imageFlow: ['역할놀이 장면, 캐릭터 표정/소품 클로즈업, 구성품 배치'],
    avoid: ['실제 의료/공구 사용처럼 위험하게 표현하지 말 것', '키링이면 휴대 소품 흐름을 우선할 것'],
  },
  bag_accessory_lifestyle: {
    usageFlow: ['착용/부착 위치 확인', '가방·목걸이·소품으로 사용', '외출 후 보관'],
    imageFlow: ['착용 또는 부착된 크기감 컷, 소재/디자인 클로즈업'],
    avoid: ['본체 기능이 없는 장식품을 작동형 완구처럼 만들지 말 것'],
  },
  seasonal_party: {
    usageFlow: ['시즌 장식 위치 확인', '파티·행사 분위기로 연출', '사용 후 보관'],
    imageFlow: ['시즌 분위기 컷, 장식 디테일, 구성품 정렬'],
    avoid: ['상품보다 배경 장식이 더 커지지 않게 할 것'],
  },
  snack_food_shape: {
    usageFlow: ['포장 확인', '간식/캔디 상품이면 섭취 또는 선물용으로 안내', '보관 방법 확인'],
    imageFlow: ['포장 정면, 내용물 형태, 선물/나눔 장면'],
    avoid: ['먹는 상품이 아니면 섭취 장면을 만들지 말 것'],
  },
  generic_toy_misc: {
    usageFlow: ['구성 확인', '손으로 잡고 놀이', '놀이 후 정리'],
    imageFlow: ['상품 단독 컷, 손에 든 크기감 컷, 주요 기능 클로즈업'],
    avoid: ['상품명에 없는 기능을 임의로 만들지 말 것'],
  },
};

export function formatAudienceGuidance(ageGroup?: DetailPageAgeGroup): string {
  if (ageGroup === 'age-14-plus') {
    return [
      '사용 연령 기준: 14세 이상 상품',
      '카피의 실제 사용자는 어린아이/유아/초등 저학년이 아니라 중고등학생·청소년이다.',
      '"아이", "어린아이", "유아", "꼬마" 같은 표현 대신 "중고등학생", "청소년", "학생" 표현을 우선 사용한다.',
      '사용 장면은 학교생활, 동아리, 취미, 야외활동, 친구와 함께 쓰는 상황처럼 청소년에게 자연스럽게 만든다.',
      '보호자 구매 관점은 필요할 때만 보조로 쓰고, 상세페이지의 이미지/문구 사용자는 청소년 기준으로 맞춘다.',
    ].join('\n');
  }

  return [
    '사용 연령 기준: 8세 이상 상품',
    '카피의 실제 사용자는 초등학생 이상 아동이다. "아이", "어린이", "초등학생" 표현을 사용할 수 있다.',
    '단, 유아/영아처럼 너무 어린 사용 장면으로 만들지 말고 8세 이상에게 자연스러운 놀이·학습·생활 장면으로 맞춘다.',
  ].join('\n');
}

export function resolveDetailImageCountLimit(detailImageCount?: DetailImageCount): number {
  if (detailImageCount === 'auto' || detailImageCount === undefined) return 2;
  const parsed = Number(detailImageCount);
  if (!Number.isInteger(parsed)) return 2;
  return Math.min(6, Math.max(2, parsed));
}

export function formatDetailImageCountGuidance(detailImageCount?: DetailImageCount): string {
  const count = resolveDetailImageCountLimit(detailImageCount);
  return `DETAIL 본문 이미지 수: ${count}개. 서로 다른 디테일/라이프 컷 ${count}장을 사용하고 패키지 이미지는 별도 packageImageIndices 로 분리한다.`;
}

export function formatUsageSectionGuidance(usageSectionMode?: UsageSectionMode): string {
  if (usageSectionMode === 'exclude') {
    return [
      '사용법 영역: 만들지 않음.',
      '사용법 안내, 사용 순서, 튜토리얼, 설명서형 섹션을 생성하지 않는다.',
      'bold-vertical 출력이면 usage.subtitle 는 빈 문자열, usage.imageIndices 는 빈 배열로 둔다.',
      '사용법 전용 이미지를 새로 생성하지 않고 DETAIL 본문 이미지만 구성한다.',
    ].join('\n');
  }

  return [
    '사용법 영역: 포함.',
    '상품 특성상 실제 사용 흐름 설명이 필요하면 사용법 안내 섹션을 만든다.',
    '사용법/설명서 이미지가 있으면 usage 전용 영역으로 분리한다.',
  ].join('\n');
}

export function formatKcCertificationGuidance(
  status?: KcCertificationStatus,
  number?: string,
): string {
  const normalizedNumber = normalizeKcCertificationNumber(number);
  if (status === 'none') {
    return [
      'KC 인증번호: 없음.',
      'KC 인증번호를 추정해서 만들지 않는다.',
      '안전표시/KC/바코드 이미지가 있으면 productInfo 표는 만들지 않고 하단 안전 이미지로 처리한다.',
    ].join('\n');
  }
  if (status === 'exists') {
    return [
      normalizedNumber ? `KC 인증번호: ${normalizedNumber}.` : 'KC 인증번호: 있음. 번호는 이미지/원문에서 확인 가능한 경우에만 사용한다.',
      '안전표시/KC/바코드 이미지가 있으면 productInfo 표와 중복하지 않는다.',
      normalizedNumber
        ? '안전표시/KC/바코드 이미지가 없을 때 productInfo 에 {"key":"KC 인증번호","value":"입력된 번호"}를 포함한다.'
        : '안전표시/KC/바코드 이미지가 없고 번호가 확인되면 productInfo 에 KC 인증번호 항목을 포함한다.',
    ].join('\n');
  }
  return [
    'KC 인증번호: AI가 원본 설명과 안전표시 이미지를 기준으로 판단.',
    '안전표시/KC/바코드 이미지가 있으면 productInfo 표와 중복하지 않는다.',
  ].join('\n');
}

export function normalizeKcCertificationNumber(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function classifyProductUseProfile(raw: Pick<RawProductInput, 'rawTitle' | 'rawCategory' | 'rawDescription' | 'rawOptions'>): ProductUseProfile {
  const haystack = normalizeProductUseText(
    [raw.rawTitle, raw.rawCategory, raw.rawDescription, raw.rawOptions].join(' '),
  );
  const matches = PRODUCT_USE_PRIORITY.filter((type) =>
    PRODUCT_USE_PATTERNS[type].some((pattern) => pattern.test(haystack)),
  );
  const primary = matches[0] ?? 'generic_toy_misc';
  const guidance = PRODUCT_USE_GUIDANCE[primary];
  return {
    primary,
    secondary: matches.filter((type) => type !== primary).slice(0, 3),
    label: PRODUCT_USE_TYPE_LABELS[primary],
    usageFlow: guidance.usageFlow,
    imageFlow: guidance.imageFlow,
    avoid: guidance.avoid,
  };
}

export function formatProductUseGuidance(raw: Pick<RawProductInput, 'rawTitle' | 'rawCategory' | 'rawDescription' | 'rawOptions'>): string {
  const profile = classifyProductUseProfile(raw);
  const secondaryLabels = profile.secondary.map((type) => PRODUCT_USE_TYPE_LABELS[type]);
  return [
    `목록 기반 상품군: ${profile.label} (${profile.primary})`,
    secondaryLabels.length > 0 ? `보조 상품군 힌트: ${secondaryLabels.join(', ')}` : '보조 상품군 힌트: 없음',
    `사용법 흐름: ${profile.usageFlow.join(' → ')}`,
    `이미지 흐름: ${profile.imageFlow.join(' / ')}`,
    `금지/주의: ${profile.avoid.join(' / ')}`,
    '상품명에 여러 상품군 단어가 섞이면 목록 기반 상품군의 사용법 흐름을 우선하고, 보조 상품군은 소재/디자인 힌트로만 반영한다.',
  ].join('\n');
}

function normalizeProductUseText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

/** 이미지 후보를 프롬프트에 삽입하는 표준 포맷터. */
export function formatImageCandidates(urls: string[]): string {
  if (urls.length === 0) return '(이미지 후보 없음)';
  return urls.map((url, i) => `${i}: ${formatImageCandidate(url, i)}`).join('\n');
}

function formatImageCandidate(url: string, index: number): string {
  if (url.startsWith('data:image/')) {
    const mime = url.slice(5, url.indexOf(';base64,'));
    return `[uploaded image ${index}${mime ? `, ${mime}` : ''}]`;
  }
  if (url.length > 240) return `${url.slice(0, 237)}...`;
  return url;
}
