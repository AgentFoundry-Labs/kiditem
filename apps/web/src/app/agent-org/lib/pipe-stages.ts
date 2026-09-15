import type { MallOperationKind } from '@kiditem/shared/mall-operation-outcomes';

/**
 * Agent Org 의 단계 목록 — 소싱부터 CS 까지.
 *
 * 단계는 성격이 셋이다.
 * - `signal`(1–4): 흐르는 상품이 아니라 5단계에 들어가는 재료. 신선도로 본다.
 * - `flow`(5–11): 상품이 왼쪽에서 오른쪽으로 넘어간다. 개수와 머문 시간으로 본다.
 * - `loop`(주문·재고·CS): 계속 도는 대기열. 기준 시간으로 본다.
 *
 * 단계가 무엇을 읽는지는 여기서만 정한다. 화면은 단계를 모르고, 이 표를 읽기만 한다.
 * 한 실행·알림·기록이 두 단계에 걸리지 않게 키를 겹치지 않는다(스펙이 검사한다).
 */
export type PipeZone = 'signal' | 'flow' | 'loop';

export type PipeStageId =
  | 'keyword'
  | 'sns'
  | 'rising'
  | 'competitor'
  | 'candidates'
  | 'supplier'
  | 'shortlist'
  | 'gate'
  | 'content'
  | 'register'
  | 'malls'
  | 'orders'
  | 'inventory'
  | 'cs'
  | 'reels'
  | 'blog'
  | 'ads';

export interface PipeStageDef {
  id: PipeStageId;
  /** 운영자가 정한 13단계 번호. 주문·출고는 그 목록에 없던 단계라 번호가 없다. */
  no: number | null;
  zone: PipeZone;
  title: string;
  /** 담당 팀. 글자로만 쓴다 — 팀 색이 상태 색과 겹쳐 색으로는 칠하지 않는다. */
  owner: string;
  /** 이 단계를 실제로 다루는 화면. 아직 화면이 없는 단계는 `null` — 없는 주소로 보내지 않는다. */
  href: string | null;
  /** 사람이 승인하는 관문인가. */
  gate?: boolean;
  /**
   * 이 단계의 원천 실패 알림 `sourceType`. 원천 소유자가 끝내 실패한 수집에 알림을 열고 다음
   * 성공이 닫으므로, 알림으로 그 원천의 실패 · 회복을 본다.
   */
  alertSourceTypes: readonly string[];
  /** 이 단계의 몰 작업 기억 종류. */
  mallOperations: readonly MallOperationKind[];
  /** 이 간격 안에 성공이 한 번은 있어야 '최신'이다. 신호 단계만 가진다. */
  expectedEveryMs: number | null;
  /**
   * 지금 코드에 이 단계를 셀 곳이 없는 이유. 있으면 화면이 '데이터 없음' 옆에 적는다.
   * 가짜 숫자로 채우지 않기 위한 자리다 — 이유가 사라지면(연결이 생기면) 여기서 지운다.
   */
  noSourceReason: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const PIPE_STAGES: readonly PipeStageDef[] = [
  {
    id: 'keyword',
    no: 1,
    zone: 'signal',
    title: '실시간 키워드',
    owner: '소싱팀',
    href: '/sourcing-ai/market',
    alertSourceTypes: ['coupang_keyword_serp', 'coupang_wing_rank'],
    mallOperations: [],
    expectedEveryMs: DAY_MS,
    noSourceReason: null,
  },
  {
    id: 'sns',
    no: 2,
    zone: 'signal',
    title: 'SNS 키워드',
    owner: '소싱팀',
    href: '/sourcing-ai/market',
    alertSourceTypes: ['tiktok.creative'],
    mallOperations: [],
    expectedEveryMs: DAY_MS,
    noSourceReason: null,
  },
  {
    id: 'rising',
    no: 3,
    zone: 'signal',
    title: '신상품',
    owner: '소싱팀',
    href: '/sourcing-ai/rising-products',
    alertSourceTypes: ['1688.hot_product'],
    mallOperations: [],
    expectedEveryMs: DAY_MS,
    noSourceReason: null,
  },
  {
    id: 'competitor',
    no: 4,
    zone: 'signal',
    title: '경쟁사',
    owner: '광고팀',
    href: '/sourcing-ai/competitor-analysis',
    alertSourceTypes: ['coupang_competitor_catalog', 'coupang_competitor_seller_identity', 'coupang_wing_itemwinner', 'coupang_wing_tracked_products'],
    mallOperations: [],
    expectedEveryMs: DAY_MS,
    noSourceReason: null,
  },
  {
    id: 'candidates',
    no: 5,
    zone: 'flow',
    title: '소싱 후보',
    owner: '소싱팀',
    href: '/sourcing-ai/decision-center',
    alertSourceTypes: [],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: '추천은 트렌드 수집 안에서 다시 계산돼 따로 실행 기록이 남지 않습니다.',
  },
  {
    id: 'supplier',
    no: 6,
    zone: 'flow',
    title: '1688·타오바오',
    owner: '소싱팀',
    href: '/sourcing-ai/wholesale-search',
    alertSourceTypes: [],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: '1688 · 타오바오 검색은 결과만 남기고 실행 · 실패 기록을 따로 두지 않습니다.',
  },
  {
    id: 'shortlist',
    no: 7,
    zone: 'flow',
    title: 'AI 선별',
    owner: '소싱팀',
    href: '/sourcing-ai/validation',
    alertSourceTypes: [],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: '환율·배송비·몰 수수료 입력이 없어 검증이 모두 막혀 있습니다.',
  },
  {
    id: 'gate',
    no: 8,
    zone: 'flow',
    title: '사람 확인',
    owner: '운영자',
    href: '/sourcing-ai/final-selection',
    gate: true,
    alertSourceTypes: [],
    mallOperations: [],
    expectedEveryMs: null,
    // 최종 선택의 결정 수(텔레그램 답장 포함)를 컨펌 보고 상태에서 읽는다.
    noSourceReason: null,
  },
  {
    id: 'content',
    no: 9,
    zone: 'flow',
    title: '상세·썸네일',
    owner: '콘텐츠팀',
    href: '/product-pipeline/collected-products',
    alertSourceTypes: [],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: '상세페이지 · 썸네일 생성 기록을 모아 볼 곳이 아직 없습니다.',
  },
  {
    id: 'register',
    no: 10,
    zone: 'flow',
    title: '상품등록',
    owner: '상품관리팀',
    href: '/product-pipeline/registered-products',
    alertSourceTypes: [],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: '상품등록 실행 기록이 서버에 남지 않습니다.',
  },
  {
    id: 'malls',
    no: 11,
    zone: 'flow',
    title: '쇼핑몰 등록',
    owner: '운영팀',
    href: '/mall-listings',
    alertSourceTypes: [],
    mallOperations: ['registration_fill'],
    expectedEveryMs: null,
    noSourceReason: null,
  },
  {
    id: 'orders',
    no: null,
    zone: 'loop',
    title: '주문 → 출고 → 송장',
    owner: '운영팀',
    href: '/order-collection',
    alertSourceTypes: ['order_collection_mall', 'coupang_direct_order_capture', 'coupang_rocket_final_order', 'coupang_shipment_summary'],
    // 주문수집 · 셀피아 전송 · 송장 결과는 Orders 가 가진 사실이다. 관찰 기록에서 읽지 않는다.
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: null,
  },
  {
    id: 'inventory',
    no: 12,
    zone: 'loop',
    title: '재고',
    owner: '상품관리팀',
    href: '/inventory-hub',
    alertSourceTypes: ['sellpia_inventory', 'sellpia_product_profitability'],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: null,
  },
  {
    id: 'cs',
    no: 13,
    zone: 'loop',
    title: 'CS',
    owner: '운영팀',
    href: '/reviews',
    alertSourceTypes: ['coupang_reviews'],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: null,
  },
  // 마케팅 — 등록한 상품으로 릴스 · 블로그를 만들고 광고로 손님을 데려온다.
  {
    id: 'reels',
    no: 14,
    zone: 'flow',
    title: '릴스 제작',
    owner: '마케팅팀',
    href: null,
    alertSourceTypes: [],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: '릴스 제작은 아직 준비 중입니다. 자리만 잡아 두었습니다.',
  },
  {
    id: 'blog',
    no: 15,
    zone: 'flow',
    title: '블로그 제작',
    owner: '마케팅팀',
    href: null,
    alertSourceTypes: [],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: '블로그 제작은 아직 준비 중입니다. 자리만 잡아 두었습니다.',
  },
  {
    id: 'ads',
    no: 16,
    zone: 'loop',
    title: '광고 마케팅',
    owner: '마케팅팀',
    href: '/ad-ops',
    alertSourceTypes: ['coupang_ad_campaign', 'coupang_ad_keyword', 'coupang_ads_daily', 'coupang_ad_profitability', 'coupang_wing_traffic'],
    mallOperations: [],
    expectedEveryMs: null,
    noSourceReason: null,
  },
];

export const PIPE_STAGE_BY_ID: ReadonlyMap<PipeStageId, PipeStageDef> = new Map(
  PIPE_STAGES.map((stage) => [stage.id, stage]),
);

function indexBy(pick: (stage: PipeStageDef) => readonly string[]): ReadonlyMap<string, PipeStageId> {
  const index = new Map<string, PipeStageId>();
  for (const stage of PIPE_STAGES) {
    for (const key of pick(stage)) index.set(key, stage.id);
  }
  return index;
}

export const STAGE_BY_ALERT_SOURCE_TYPE = indexBy((stage) => stage.alertSourceTypes);
export const STAGE_BY_MALL_OPERATION = indexBy((stage) => stage.mallOperations);
