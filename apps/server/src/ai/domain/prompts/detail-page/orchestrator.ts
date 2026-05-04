/**
 * Detail Page Prompt — Orchestrator
 *
 * 11 개 섹션 LLM 호출의 의존성·순서 명세 (declarative).
 * 실제 LLM caller (Gemini 호출 + zod parse + 재시도) 는 별도 service 에서 wiring.
 *
 * 의존성 그래프:
 *
 *   raw 입력
 *      │
 *      ▼
 *   ① Section 1 (Hero)            → koreanName, subhead, heroImageIndex
 *      │
 *      ├─→ ② Section 2 (Reviews)        [koreanName]
 *      ├─→ ③ Section 3 (Usage)          [koreanName]
 *      ├─→ ④ Section 4 (Pain Points)    [koreanName]
 *      ▼
 *   ⑤ Section 5 (Solution)         → headlines, subcopy[3], imageIndex
 *      │
 *      ▼
 *   ⑥ Section 6 (Features)         [section5Subcopy]   → cards[3] = USP[0,1,2]
 *      │
 *      ├─→ ⑦ Section 7 (KeyPoint 1)     [USP[0]]
 *      ├─→ ⑧ Section 8 (Blue Section)   [USP[1,2], section1Subhead, usedImageIndices]
 *      ▼
 *   ⑨ Section 9 (KeyPoint 2)       [mainUsps]                → topic
 *      │
 *      ▼
 *   ⑩ Section 10 (Lifestyles)      [mainUsps, section9Topic, usedImageIndices]
 *      │
 *      ▼
 *   ⑪ Section 11 (Gallery)         [usedImageIndices]
 *      │
 *      ▼
 *   [Footer 정형 블록 — LLM 호출 X]
 *      │
 *      ▼
 *   최종 DetailPageData JSON
 */

export type SectionId =
  | 'section-1'
  | 'section-2'
  | 'section-3'
  | 'section-4'
  | 'section-5'
  | 'section-6'
  | 'section-7'
  | 'section-8'
  | 'section-9'
  | 'section-10'
  | 'section-11';

/** 한 섹션의 의존성 + 병렬 가능 여부. */
export interface SectionStep {
  id: SectionId;
  /** 시작 전에 완료되어야 하는 섹션들 */
  dependsOn: SectionId[];
  /** 같은 phase 내에서 병렬로 실행 가능한 다른 섹션들 (참고용) */
  parallelWith: SectionId[];
  /** Phase 번호. 같은 phase 끼리는 병렬 가능. */
  phase: 1 | 2 | 3 | 4 | 5;
  /** 이 섹션이 사용하는 이미지를 usedImageIndices 누적에 포함할지 */
  contributesToUsedImages: boolean;
}

/**
 * 호출 순서 그래프. NestJS service 가 phase 순회하며
 * 같은 phase 의 섹션들을 Promise.all 로 병렬 dispatch 하는 데 사용.
 */
export const DETAIL_PAGE_ORCHESTRATION: readonly SectionStep[] = [
  {
    id: 'section-1',
    dependsOn: [],
    parallelWith: [],
    phase: 1,
    contributesToUsedImages: true,
  },
  {
    id: 'section-2',
    dependsOn: ['section-1'],
    parallelWith: ['section-3', 'section-4', 'section-5'],
    phase: 2,
    contributesToUsedImages: false,
  },
  {
    id: 'section-3',
    dependsOn: ['section-1'],
    parallelWith: ['section-2', 'section-4', 'section-5'],
    phase: 2,
    contributesToUsedImages: true,
  },
  {
    id: 'section-4',
    dependsOn: ['section-1'],
    parallelWith: ['section-2', 'section-3', 'section-5'],
    phase: 2,
    contributesToUsedImages: true,
  },
  {
    id: 'section-5',
    dependsOn: ['section-1'],
    parallelWith: ['section-2', 'section-3', 'section-4'],
    phase: 2,
    contributesToUsedImages: true,
  },
  {
    id: 'section-6',
    dependsOn: ['section-5'],
    parallelWith: [],
    phase: 3,
    contributesToUsedImages: true,
  },
  {
    id: 'section-7',
    dependsOn: ['section-6'],
    parallelWith: ['section-8'],
    phase: 4,
    contributesToUsedImages: true,
  },
  {
    id: 'section-8',
    dependsOn: ['section-6'],
    parallelWith: ['section-7'],
    phase: 4,
    contributesToUsedImages: true,
  },
  {
    id: 'section-9',
    dependsOn: ['section-7', 'section-8'],
    parallelWith: [],
    phase: 5,
    contributesToUsedImages: false,
  },
  {
    id: 'section-10',
    dependsOn: ['section-9'],
    parallelWith: [],
    phase: 5,
    contributesToUsedImages: true,
  },
  {
    id: 'section-11',
    dependsOn: ['section-10'],
    parallelWith: [],
    phase: 5,
    contributesToUsedImages: true,
  },
] as const;

/**
 * Phase 별로 그룹핑된 섹션들. service 가 phase 순회하며 각 phase 내부는 Promise.all.
 *
 * Phase 1: ①
 * Phase 2: ②③④⑤ (병렬)
 * Phase 3: ⑥
 * Phase 4: ⑦⑧ (병렬)
 * Phase 5: ⑨ → ⑩ → ⑪ (순차, mainUsps/section9Topic/usedImageIndices 누적)
 */
export const ORCHESTRATION_BY_PHASE: Record<number, SectionId[]> = {
  1: ['section-1'],
  2: ['section-2', 'section-3', 'section-4', 'section-5'],
  3: ['section-6'],
  4: ['section-7', 'section-8'],
  // Phase 5 는 순차 (각 섹션이 직전 결과를 입력으로 받음).
  // 굳이 그룹핑한 이유는 phase 순회 코드 통일성.
  5: ['section-9', 'section-10', 'section-11'],
};

/**
 * Footer 정형 블록 — LLM 호출 X. 템플릿 + 제품 메타로 채움.
 * 사용자 입력 / 회사 설정에서 가져옴.
 */
export interface FooterStaticData {
  productName: string; // koreanName 그대로
  modelName: string; // rawTitle 그대로
  composition: string; // rawOptions 에서 파싱
  color: string; // rawOptions 에서 파싱 또는 "다양한 컬러"
  size: string; // 고정 "상세페이지 참고"
  origin: string; // 고정 "중국" 또는 사용자 입력
  seller: string; // 사용자 입력
  csPhone: string; // 사용자 입력
  shippingNotice: string; // 고정
  returnPolicy: string; // 고정
}

export const FOOTER_STATIC_DEFAULTS = {
  size: '상세페이지 참고',
  shippingNotice:
    '결제 후 순차 발송됩니다.\n배송일, 배송비는 옵션에서 확인',
  returnPolicy:
    '단순변심 교환/반품은 상품 수령 후 7일 이내 가능하며, 사용 흔적, 가치 훼손 시 제한될 수 있습니다.\n특가/프로모션 상품은 변심 반품 시 왕복 배송비가 부과될 수 있습니다.\n제품 이상은 사진과 함께 고객센터로 문의 주시면 빠르게 확인해 드립니다.\n단순변심 교환/반품 시 5,000원 배송료가 청구됩니다.',
} as const;
