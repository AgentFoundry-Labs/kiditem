/**
 * 초기 진입(테스트 발주) 후보 스코어링.
 *
 * 네 개의 서로 다른 소스를 하나의 표로 합친다.
 *
 * | 소스 | 답하는 질문 |
 * |---|---|
 * | 1688 신상품 | 살 수 있는가 / 얼마에 / 최소 몇 개부터 |
 * | 키워드 트렌드(네이버 인기 보드) | 지금 수요가 살아있는가 |
 * | 쿠팡 경쟁 상품(1688 매칭 결과) | 이미 누가 얼마나 강하게 잡고 있는가 |
 * | 쿠팡 급상승 후보 | 지금 뜨는 중인가 |
 *
 * "좋은 상품"이 아니라 **"작게 테스트해보기 좋은 상품"** 을 고른다. 그래서 마진과
 * 수요만 보지 않고, 최소주문수량(MOQ)이 낮고 경쟁 리뷰가 얕은 쪽에 가산한다.
 * 이미 리뷰 수천 개가 쌓인 카테고리는 마진이 좋아도 초기 진입 대상이 아니다.
 *
 * 이 파일은 순수 함수만 둔다 — NestJS/Prisma/IO 없음.
 */

import { recommendationItemKey } from './sourcing-recommendation-identity';
import { businessDateKey, datesInclusive, parseBusinessDate } from '../../common/kst';

/** 1688 신상품 스냅샷 한 건. 수집기가 주는 필드 중 판단에 쓰는 것만 좁혀서 받는다. */
export interface EntrySupplyItem {
  /** 공급처가 보장하는 외부 오퍼 식별자. 제목·배열 순서는 절대 식별자로 쓰지 않는다. */
  externalOfferId?: string | null;
  /** 옵션별로 가격/MOQ가 달라질 때의 정규화된 변형 식별자. */
  variantKey?: string | null;
  /** 원본 공급 관측 row. 추천 결과에서 provenance를 역추적하는 데 쓴다. */
  offerObservationId?: string | null;
  /** 원본 증거 관측 row. 없으면 아직 증거가 없는 수집값이라는 뜻이다. */
  evidenceObservationId?: string | null;
  title?: string | null;
  keyword?: string | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  priceCny?: number | null;
  landedCostKrw?: number | null;
  targetSalePriceKrw?: number | null;
  estimatedProfitKrw?: number | null;
  estimatedMarginRate?: number | null;
  minOrderQuantity?: number | null;
  serviceScore?: number | null;
  repurchaseRate?: string | null;
  shippingFulfillmentRate?: string | null;
  shippingPickupRate?: string | null;
  supplierName?: string | null;
  purchaseTags?: string[] | null;
  supplierTags?: string[] | null;
  salesNum?: number | null;
  matchedCoupang?: EntryMatchedCoupang | null;
}

export interface EntryMatchedCoupang {
  productId?: string | null;
  productName?: string | null;
  salePrice?: number | null;
  reviews?: number | null;
  grade?: string | null;
  score?: number | null;
  salesLast3d?: number | null;
  salesLast28d?: number | null;
  marketReaction?: number | null;
  primaryKeyword?: string | null;
}

/** 쿠팡 급상승 탐지 결과 한 건. */
export interface EntryRisingCandidate {
  keyword?: string | null;
  score?: number | null;
  grade?: string | null;
  productName?: string | null;
  signals?: {
    rankClimb?: number | null;
    reviewGrowth?: number | null;
    monthlySearchVolume?: number | null;
    observationDays?: number | null;
  } | null;
}

/** 네이버 인기 키워드 보드 행. 같은 키워드가 여러 보드/일자에 걸쳐 나온다. */
export interface EntryPopularKeyword {
  keyword: string;
  boardKey: string;
  boardLabel: string | null;
  businessDate: Date;
  rank: number;
}

/**
 * 운영자가 등록해 둔 관심 키워드.
 *
 * 두 곳에서 온다 — 키워드 분석 화면에서 "관심 키워드로 저장"한 것(`saved`)과,
 * 트렌드 수집 시드로 등록한 것(`seed`). 둘 다 관심의 표현이지만 성격이 달라
 * 출처를 지우지 않고 그대로 들고 다닌다.
 */
export interface EntryInterestKeyword {
  keyword: string;
  origin: 'saved' | 'seed';
}

/** 상품이 관심 키워드에 얼마나 정확히 걸렸는지. */
export type EntryInterestTier =
  /** 관심 키워드와 정규화 후 완전히 같다. */
  | 'exact'
  /** 한쪽이 다른 쪽을 포함한다("여아원피스" ↔ "원피스"). */
  | 'related';

export interface EntryInterestMatch {
  /** 가장 강한 매칭 등급. 화면 배지는 이걸 쓴다. */
  tier: EntryInterestTier;
  /** `tier` 등급으로 걸린 키워드. */
  keywords: string[];
  origins: ('saved' | 'seed')[];
  /**
   * 걸린 **모든** 키워드를 등급과 함께 담는다.
   *
   * `keywords` 만 두면, 한 상품이 A 에 정확히·B 에 부분으로 걸렸을 때 B 가 통째로
   * 사라져서 "B 는 후보 0건"으로 잘못 집계된다(실제로는 표에 있는데 수집하라고 안내함).
   */
  matches: Array<{ keyword: string; tier: EntryInterestTier }>;
}

/**
 * 관심 키워드가 지금 어떤 상태인지.
 *
 * - `candidates`: 표에 올릴 공급 후보가 있다.
 * - `demand_only`: 수요 신호(인기 보드/급상승)는 잡히는데 **1688 공급 후보가 없다.**
 *   → 이 키워드로 1688 수집을 돌리라는 뜻. 가장 행동으로 옮기기 쉬운 상태다.
 * - `no_signal`: 어디에도 안 잡힌다.
 */
export type EntryInterestState = 'candidates' | 'demand_only' | 'no_signal';

/** 관심 키워드별로 실제 후보가 몇 개 잡혔는지. 0 이면 수집이 필요하다는 신호다. */
export interface EntryInterestKeywordStatus {
  keyword: string;
  /**
   * 이 키워드가 등록된 곳. 같은 키워드가 저장 관심어이면서 수집 시드인 경우가 있어
   * 배열로 둔다 — 단일 값으로 두면 칩과 안내 문구가 두 번씩 나온다.
   */
  origins: ('saved' | 'seed')[];
  exactCount: number;
  relatedCount: number;
  state: EntryInterestState;
  /** 공급 후보가 없어도 수요는 있을 수 있다. 그 근거를 같이 돌려준다. */
  demand: {
    boardLabel: string | null;
    boardRank: number | null;
    risingScore: number | null;
    monthlySearchVolume: number | null;
  } | null;
}

export interface EntryRecommendationComponents {
  /** 마진율 기반. 팔았을 때 남는가. */
  margin: number;
  /** 검색 수요. 지금 찾는 사람이 있는가. */
  demand: number;
  /** 경쟁 여유도. 높을수록 경쟁이 얕다(= 진입하기 쉽다). */
  competition: number;
  /** 상승 모멘텀. 지금 뜨는 중인가. */
  momentum: number;
  /** 공급 안정성. 소량으로 반복 발주가 되는가. */
  supplier: number;
}

export type EntryRecommendationGrade = 'A' | 'B' | 'C' | 'WATCH';

export interface EntryRecommendation {
  /** `sourcePlatform + externalOfferId + variantKey + matchedCoupangProductId`의 안정 키. */
  itemKey: string;
  /** 이전 UI 호환용 별칭. 새 코드에서는 `itemKey`를 쓴다. */
  id: string;
  externalOfferId: string;
  variantKey: string;
  offerObservationId: string | null;
  evidenceObservationId: string | null;
  rank: number;
  keyword: string | null;
  /** 최신 인기 보드에서 직전 일자 대비 새로 등장한 키워드. */
  isNewKeyword: boolean;
  title: string;
  imageUrl: string | null;
  overseasMall: string;
  sourceUrl: string | null;
  overseasPriceKrw: number | null;
  overseasPriceCny: number | null;
  salePriceKrw: number | null;
  shippingLabel: string;
  rating: number | null;
  tags: string[];
  minOrderQuantity: number | null;
  estimatedMarginRate: number | null;
  estimatedProfitKrw: number | null;
  supplierName: string | null;
  coupang: {
    productId: string | null;
    productName: string | null;
    salePrice: number | null;
    reviews: number | null;
  } | null;
  score: number;
  grade: EntryRecommendationGrade;
  components: EntryRecommendationComponents;
  reasons: string[];
  risks: string[];
  /** 이 행을 만드는 데 실제로 기여한 소스 키. 화면에서 근거를 보여주는 데 쓴다. */
  contributingSources: EntrySourceKey[];
  /**
   * 관심 키워드 매칭. 없으면 null.
   *
   * 점수에는 반영하지 않는다 — 관심은 "내가 보고 싶은 것"이고 점수는 "객관적으로
   * 진입하기 좋은 것"이라, 섞으면 관심 키워드가 항상 상위로 올라와 스코어를 못 믿게 된다.
   * 분류와 정렬에만 쓴다.
   */
  interest: EntryInterestMatch | null;
}

export const ENTRY_SOURCE_KEYS = [
  'supply_1688_new',
  'keyword_trend',
  'coupang_competitor',
  'coupang_rising',
] as const;
export type EntrySourceKey = (typeof ENTRY_SOURCE_KEYS)[number];

export interface EntrySourceStatus {
  key: EntrySourceKey;
  label: string;
  /** 이 소스에서 실제로 읽힌 행 수. 0이면 화면이 이유를 표시해야 한다. */
  rowCount: number;
  /** 소스 데이터의 기준일. 없으면 null. */
  businessDate: string | null;
  /** 기준일이 오늘에서 며칠 지났는지. 데이터가 없으면 null. */
  staleDays: number | null;
}

export interface EntryRecommendationResult {
  items: EntryRecommendation[];
  sources: EntrySourceStatus[];
  /** 등록된 관심 키워드와 각각에 잡힌 후보 수. */
  interestKeywords: EntryInterestKeywordStatus[];
  /** 비어 있거나 신뢰도가 떨어지는 이유. 화면은 이걸 그대로 노출한다. */
  dataGaps: string[];
}

const SOURCE_LABELS: Record<EntrySourceKey, string> = {
  supply_1688_new: '1688 신상품',
  keyword_trend: '키워드 트렌드',
  coupang_competitor: '쿠팡 경쟁상품',
  coupang_rising: '쿠팡 급상승',
};

/**
 * 가중치. 합이 100이 되도록 유지한다.
 *
 * 마진이 가장 높지만 지배적이지는 않게 둔다 — 마진만 보면 아무도 안 찾는 상품이
 * 1등으로 올라온다. 경쟁 여유도를 수요와 같은 무게로 둔 것이 이 스코어의 핵심이다.
 */
const WEIGHTS: EntryRecommendationComponents = {
  margin: 30,
  demand: 20,
  competition: 20,
  momentum: 15,
  supplier: 15,
};

/** 이 개수를 넘는 MOQ 는 "소량 테스트"로 보지 않는다. */
const TEST_FRIENDLY_MOQ = 5;
/**
 * 한 키워드에서 최대 몇 행까지 보여줄지.
 *
 * 1688 수집은 키워드 하나로 수십 개를 긁어오기 때문에, 점수순으로만 자르면 표 전체가
 * 같은 상품의 변종으로 채워진다(실측: 상위 50행이 전부 "포켓몬카드"). 진입 후보를
 * 고르는 화면에서 그건 선택지가 하나뿐인 것과 같다. 키워드별 상한을 둬 폭을 확보한다.
 */
const MAX_ITEMS_PER_KEYWORD = 3;
/**
 * 관심 키워드에 걸린 상품은 상한을 더 준다. 운영자가 일부러 등록해 둔 키워드이므로
 * 선택지를 3개로 줄이면 오히려 답답하다.
 */
const MAX_ITEMS_PER_INTEREST_KEYWORD = 6;
/** 경쟁 여유도를 0점으로 보는 리뷰 수. 이 이상이면 초기 진입 난이도가 급격히 오른다. */
const SATURATED_REVIEW_COUNT = 500;

export interface BuildEntryRecommendationsInput {
  supplyItems: EntrySupplyItem[];
  risingCandidates: EntryRisingCandidate[];
  popularKeywords: EntryPopularKeyword[];
  interestKeywords: EntryInterestKeyword[];
  supplyBusinessDate: string | null;
  risingBusinessDate: string | null;
  today: Date;
  limit: number;
}

export function buildEntryRecommendations(
  input: BuildEntryRecommendationsInput,
): EntryRecommendationResult {
  const { supplyItems, risingCandidates, popularKeywords, interestKeywords, today, limit } = input;

  const keywordIndex = indexPopularKeywords(popularKeywords);
  const risingIndex = indexRisingByKeyword(risingCandidates);
  const interest = indexInterestKeywords(interestKeywords);
  const competitorCount = supplyItems.filter((item) => item.matchedCoupang != null).length;

  const scored = supplyItems
    .map((item) => toRecommendation(item, keywordIndex, risingIndex, interest.match))
    .filter((item): item is EntryRecommendation => item !== null)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const items = capPerKeyword(scored)
    // 관심 매칭을 위로 올린다. 정렬만 바꾸고 점수는 건드리지 않는다.
    .sort((a, b) => interestWeight(b) - interestWeight(a) || b.score - a.score)
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const sources: EntrySourceStatus[] = [
    buildSourceStatus('supply_1688_new', supplyItems.length, input.supplyBusinessDate, today),
    buildSourceStatus('keyword_trend', popularKeywords.length, keywordIndex.latestDate, today),
    buildSourceStatus('coupang_competitor', competitorCount, input.supplyBusinessDate, today),
    buildSourceStatus('coupang_rising', risingCandidates.length, input.risingBusinessDate, today),
  ];

  // 후보 수는 잘라내기 전 전체(`scored`) 기준으로 센다. 표에 안 보이는 것까지
  // 포함해야 "이 관심 키워드는 아예 후보가 없다"를 정확히 말할 수 있다.
  const interestStatuses = buildInterestStatuses(interest.list, scored, keywordIndex, risingIndex);

  return {
    items,
    sources,
    interestKeywords: interestStatuses,
    dataGaps: collectDataGaps(sources, items.length, interestStatuses),
  };
}

function interestWeight(item: EntryRecommendation): number {
  if (item.interest?.tier === 'exact') return 2;
  if (item.interest?.tier === 'related') return 1;
  return 0;
}

/**
 * 공급 아이템 하나를 표의 한 행으로 바꾼다.
 *
 * 제목이 없으면 버린다 — 표에 이름 없는 행을 넣느니 빼는 편이 낫다.
 */
function toRecommendation(
  item: EntrySupplyItem,
  keywordIndex: PopularKeywordIndex,
  risingIndex: Map<string, EntryRisingCandidate>,
  matchInterest: (keyword: string | null, title: string) => EntryInterestMatch | null,
): EntryRecommendation | null {
  const title = (item.title ?? '').trim();
  const externalOfferId = (item.externalOfferId ?? '').trim();
  if (!title || !externalOfferId) return null;

  const variantKey = (item.variantKey ?? '').trim();
  const matchedCoupangProductId = nonEmpty(item.matchedCoupang?.productId);
  const itemKey = recommendationItemKey({
    sourcePlatform: '1688',
    externalOfferId,
    variantKey,
    matchedCoupangProductId,
  });

  const keyword = (item.keyword ?? item.matchedCoupang?.primaryKeyword ?? '').trim() || null;
  const rising = keyword ? risingIndex.get(normalizeKeyword(keyword)) : undefined;
  const trend = keyword ? keywordIndex.lookup(keyword) : null;

  // 컴포넌트는 화면에 그대로 막대로 그려지므로 정수로 맞춘다.
  const components: EntryRecommendationComponents = {
    margin: Math.round(scoreMargin(item.estimatedMarginRate)),
    demand: Math.round(scoreDemand(trend, rising)),
    competition: Math.round(scoreCompetition(item.matchedCoupang)),
    momentum: Math.round(scoreMomentum(rising)),
    supplier: Math.round(scoreSupplier(item)),
  };

  const score = Math.round(
    (Object.keys(WEIGHTS) as (keyof EntryRecommendationComponents)[]).reduce(
      (sum, key) => sum + (components[key] * WEIGHTS[key]) / 100,
      0,
    ),
  );

  const contributingSources: EntrySourceKey[] = ['supply_1688_new'];
  if (trend) contributingSources.push('keyword_trend');
  if (item.matchedCoupang) contributingSources.push('coupang_competitor');
  if (rising) contributingSources.push('coupang_rising');

  return {
    itemKey,
    id: itemKey,
    externalOfferId,
    variantKey,
    offerObservationId: nonEmpty(item.offerObservationId),
    evidenceObservationId: nonEmpty(item.evidenceObservationId),
    rank: 0,
    keyword,
    isNewKeyword: trend?.isNew ?? false,
    title,
    imageUrl: nonEmpty(item.imageUrl),
    overseasMall: '1688',
    sourceUrl: nonEmpty(item.sourceUrl),
    overseasPriceKrw: numberOrNull(item.landedCostKrw),
    overseasPriceCny: numberOrNull(item.priceCny),
    salePriceKrw: numberOrNull(item.targetSalePriceKrw ?? item.matchedCoupang?.salePrice),
    shippingLabel: resolveShippingLabel(item),
    rating: numberOrNull(item.serviceScore),
    tags: collectTags(item),
    minOrderQuantity: numberOrNull(item.minOrderQuantity),
    estimatedMarginRate: numberOrNull(item.estimatedMarginRate),
    estimatedProfitKrw: numberOrNull(item.estimatedProfitKrw),
    supplierName: nonEmpty(item.supplierName),
    coupang: item.matchedCoupang
      ? {
          productId: matchedCoupangProductId,
          productName: nonEmpty(item.matchedCoupang.productName),
          salePrice: numberOrNull(item.matchedCoupang.salePrice),
          reviews: numberOrNull(item.matchedCoupang.reviews),
        }
      : null,
    score,
    grade: toGrade(score),
    components,
    reasons: buildReasons(item, trend, rising, components),
    risks: buildRisks(item, components),
    contributingSources,
    interest: matchInterest(keyword, title),
  };
}

/** 마진율 0% → 0점, 50% 이상 → 100점. 50%를 초기 진입의 충분 조건으로 본다. */
function scoreMargin(marginRate: number | null | undefined): number {
  if (marginRate == null || !Number.isFinite(marginRate)) return 0;
  return clamp((marginRate / 50) * 100);
}

/**
 * 수요 점수. 인기 보드 순위가 있으면 그것을 우선하고, 없으면 급상승 후보의
 * 월 검색량으로 보완한다. 둘 다 없으면 0 — 추측으로 점수를 만들지 않는다.
 */
function scoreDemand(
  trend: PopularKeywordHit | null,
  rising: EntryRisingCandidate | undefined,
): number {
  const scores: number[] = [];

  if (trend) {
    // 1위 100점, 20위 밖 30점. 보드 상위일수록 검색 수요가 두껍다.
    scores.push(clamp(100 - (trend.bestRank - 1) * 3.5));
  }

  const volume = rising?.signals?.monthlySearchVolume;
  if (volume != null && Number.isFinite(volume) && volume > 0) {
    // 월 5만 이상이면 만점. 로그 스케일이 체감에 가깝다.
    scores.push(clamp((Math.log10(volume) / Math.log10(50_000)) * 100));
  }

  if (scores.length === 0) return 0;
  return Math.round(Math.max(...scores));
}

/**
 * 경쟁 여유도. 리뷰가 적을수록 높다.
 *
 * 매칭된 쿠팡 상품이 아예 없으면 50점(중립)을 준다 — 경쟁이 없다는 근거가 아니라
 * 아직 모른다는 뜻이므로, 만점을 주면 안 된다.
 */
function scoreCompetition(matched: EntryMatchedCoupang | null | undefined): number {
  if (!matched) return 50;

  const reviews = matched.reviews;
  if (reviews == null || !Number.isFinite(reviews)) return 50;
  return clamp(100 - (reviews / SATURATED_REVIEW_COUNT) * 100);
}

/** 급상승 후보로 잡혀 있으면 그 점수를 그대로 쓴다. 없으면 0. */
function scoreMomentum(rising: EntryRisingCandidate | undefined): number {
  if (!rising) return 0;
  const score = rising.score;
  if (score != null && Number.isFinite(score)) return clamp(score);

  const climb = rising.signals?.rankClimb;
  if (climb != null && Number.isFinite(climb) && climb > 0) return clamp(climb * 2);
  return 0;
}

/**
 * 공급 안정성. MOQ 가 낮을수록, 서비스 점수/재구매율/출고율이 높을수록 높다.
 * 소량 테스트가 목적이므로 MOQ 비중을 가장 크게 둔다.
 */
function scoreSupplier(item: EntrySupplyItem): number {
  // [값, 가중치] 쌍으로 모아 가중 평균한다. 없는 지표는 아예 빼서, 값이 없다는 이유로
  // 점수가 깎이지 않게 한다.
  const parts: [value: number, weight: number][] = [];

  const moq = item.minOrderQuantity;
  if (moq != null && Number.isFinite(moq) && moq > 0) {
    parts.push([clamp(moq <= TEST_FRIENDLY_MOQ ? 100 : (TEST_FRIENDLY_MOQ / moq) * 100), 3]);
  }

  const service = item.serviceScore;
  if (service != null && Number.isFinite(service)) {
    parts.push([clamp((service / 5) * 100), 2]);
  }

  const repurchase = parsePercent(item.repurchaseRate);
  if (repurchase != null) parts.push([clamp(repurchase), 1]);

  const fulfillment = parsePercent(item.shippingFulfillmentRate);
  if (fulfillment != null) parts.push([clamp(fulfillment), 1]);

  if (parts.length === 0) return 0;
  const weightSum = parts.reduce((sum, [, weight]) => sum + weight, 0);
  return Math.round(parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / weightSum);
}

function buildReasons(
  item: EntrySupplyItem,
  trend: PopularKeywordHit | null,
  rising: EntryRisingCandidate | undefined,
  components: EntryRecommendationComponents,
): string[] {
  const reasons: string[] = [];

  if (item.estimatedMarginRate != null && item.estimatedMarginRate >= 40) {
    reasons.push(`예상 마진율 ${round1(item.estimatedMarginRate)}%`);
  }
  if (item.minOrderQuantity != null && item.minOrderQuantity <= TEST_FRIENDLY_MOQ) {
    reasons.push(`최소주문 ${item.minOrderQuantity}개로 소량 테스트 가능`);
  }
  if (trend) {
    const label = trend.boardLabel ?? trend.boardKey;
    reasons.push(`${label} 보드 ${trend.bestRank}위 키워드${trend.isNew ? ' (신규 진입)' : ''}`);
  }
  if (rising?.signals?.rankClimb != null && rising.signals.rankClimb > 0) {
    reasons.push(`쿠팡 순위 ${rising.signals.rankClimb}계단 상승`);
  }
  if (components.competition >= 70 && item.matchedCoupang?.reviews != null) {
    reasons.push(`경쟁 상품 리뷰 ${item.matchedCoupang.reviews}개로 얕음`);
  }

  return reasons;
}

function buildRisks(item: EntrySupplyItem, components: EntryRecommendationComponents): string[] {
  const risks: string[] = [];

  if (components.demand === 0) {
    risks.push('검색 수요 근거 없음 — 키워드 트렌드/급상승 어디에도 안 잡힘');
  }
  if (item.matchedCoupang?.reviews != null && item.matchedCoupang.reviews >= SATURATED_REVIEW_COUNT) {
    risks.push(`경쟁 상품 리뷰 ${item.matchedCoupang.reviews}개 — 초기 진입 난이도 높음`);
  }
  if (item.minOrderQuantity != null && item.minOrderQuantity > TEST_FRIENDLY_MOQ) {
    risks.push(`최소주문 ${item.minOrderQuantity}개 — 소량 테스트 부담`);
  }
  if (item.estimatedMarginRate != null && item.estimatedMarginRate < 25) {
    risks.push(`예상 마진율 ${round1(item.estimatedMarginRate)}% — 광고비 태우면 남지 않음`);
  }
  if (!item.matchedCoupang) {
    risks.push('쿠팡 매칭 상품 없음 — 판매가/경쟁 강도 미확인');
  }

  return risks;
}

function toGrade(score: number): EntryRecommendationGrade {
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  return 'WATCH';
}

interface PopularKeywordHit {
  boardKey: string;
  boardLabel: string | null;
  bestRank: number;
  isNew: boolean;
}

interface PopularKeywordIndex {
  lookup(keyword: string): PopularKeywordHit | null;
  latestDate: string | null;
}

/**
 * 인기 키워드를 조회용으로 인덱싱한다.
 *
 * 최신 일자와 그 직전 일자를 비교해 "신규 진입" 여부를 만든다. 일자가 하나뿐이면
 * 비교 대상이 없으므로 전부 신규가 아닌 것으로 둔다 — 첫 수집일에 모든 키워드가
 * NEW 로 보이는 것은 정보가 아니라 잡음이다.
 */
function indexPopularKeywords(rows: EntryPopularKeyword[]): PopularKeywordIndex {
  if (rows.length === 0) {
    return { lookup: () => null, latestDate: null };
  }

  const byDate = new Map<string, EntryPopularKeyword[]>();
  for (const row of rows) {
    const key = toDateKey(row.businessDate);
    const bucket = byDate.get(key);
    if (bucket) bucket.push(row);
    else byDate.set(key, [row]);
  }

  const dates = [...byDate.keys()].sort().reverse();
  const latestDate = dates[0] ?? null;
  const previousDate = dates[1] ?? null;

  const latestRows = latestDate ? (byDate.get(latestDate) ?? []) : [];
  const previousKeywords = new Set(
    (previousDate ? (byDate.get(previousDate) ?? []) : []).map((row) => normalizeKeyword(row.keyword)),
  );

  const index = new Map<string, PopularKeywordHit>();
  for (const row of latestRows) {
    const key = normalizeKeyword(row.keyword);
    const existing = index.get(key);
    if (existing && existing.bestRank <= row.rank) continue;
    index.set(key, {
      boardKey: row.boardKey,
      boardLabel: row.boardLabel,
      bestRank: row.rank,
      isNew: previousDate != null && !previousKeywords.has(key),
    });
  }

  return {
    latestDate,
    lookup: (keyword: string) => {
      const normalized = normalizeKeyword(keyword);
      const exact = index.get(normalized);
      if (exact) return exact;

      // 상품 키워드는 보드 키워드보다 길게 잡히는 일이 잦다("여아원피스" vs "원피스").
      // 부분 포함으로 한 번 더 본다. 가장 상위 순위를 택한다.
      let best: PopularKeywordHit | null = null;
      for (const [boardKeyword, hit] of index) {
        if (boardKeyword.length < 2) continue;
        if (!normalized.includes(boardKeyword) && !boardKeyword.includes(normalized)) continue;
        if (!best || hit.bestRank < best.bestRank) best = hit;
      }
      return best;
    },
  };
}

/**
 * 키워드당 상위 N 개만 남긴다. 입력이 이미 점수 내림차순이라는 전제 위에서 동작한다.
 * 키워드가 없는 행은 묶을 근거가 없으므로 제한하지 않는다.
 */
function capPerKeyword(items: EntryRecommendation[]): EntryRecommendation[] {
  const seen = new Map<string, number>();
  const kept: EntryRecommendation[] = [];

  for (const item of items) {
    if (!item.keyword) {
      kept.push(item);
      continue;
    }
    const key = normalizeKeyword(item.keyword);
    const count = seen.get(key) ?? 0;
    const cap = item.interest ? MAX_ITEMS_PER_INTEREST_KEYWORD : MAX_ITEMS_PER_KEYWORD;
    if (count >= cap) continue;
    seen.set(key, count + 1);
    kept.push(item);
  }

  return kept;
}

interface InterestIndex {
  /** 정규화 기준 **중복 없는** 관심 키워드. 같은 키워드의 여러 출처는 합쳐진다. */
  list: Array<{ keyword: string; origins: ('saved' | 'seed')[] }>;
  match: (keyword: string | null, title: string) => EntryInterestMatch | null;
}

/**
 * 관심 키워드를 조회용으로 인덱싱한다.
 *
 * 상품 키워드에 먼저 맞춰 보고, 없으면 상품명까지 훑는다 — 1688 상품은 키워드가
 * 중국어이거나 비어 있는 경우가 잦아서(예: `儿童水枪玩具`) 키워드만 보면 놓친다.
 * 같은 키워드가 두 출처에 다 있으면 출처를 합쳐서 보여준다.
 */
function indexInterestKeywords(keywords: EntryInterestKeyword[]): InterestIndex {
  const byNormalized = new Map<string, { keyword: string; origins: Set<'saved' | 'seed'> }>();

  for (const entry of keywords) {
    const raw = entry.keyword.trim();
    if (raw.length < 2) continue;
    const key = normalizeKeyword(raw);
    if (key.length < 2) continue;

    const existing = byNormalized.get(key);
    if (existing) existing.origins.add(entry.origin);
    else byNormalized.set(key, { keyword: raw, origins: new Set([entry.origin]) });
  }

  // 키워드 하나에 행 하나. 출처는 합쳐서 들고 간다.
  const list = [...byNormalized.values()].map((entry) => ({
    keyword: entry.keyword,
    origins: [...entry.origins],
  }));

  if (byNormalized.size === 0) {
    return { list, match: () => null };
  }

  return {
    list,
    match: (keyword, title) => {
      const normalizedKeyword = keyword ? normalizeKeyword(keyword) : '';
      const normalizedTitle = normalizeKeyword(title);

      const exact: string[] = [];
      const related: string[] = [];
      const matches: Array<{ keyword: string; tier: EntryInterestTier }> = [];
      const origins = new Set<'saved' | 'seed'>();

      for (const [key, entry] of byNormalized) {
        if (normalizedKeyword && normalizedKeyword === key) {
          exact.push(entry.keyword);
          matches.push({ keyword: entry.keyword, tier: 'exact' });
          entry.origins.forEach((origin) => origins.add(origin));
          continue;
        }
        const partial =
          (normalizedKeyword && (normalizedKeyword.includes(key) || key.includes(normalizedKeyword))) ||
          normalizedTitle.includes(key);
        if (partial) {
          related.push(entry.keyword);
          matches.push({ keyword: entry.keyword, tier: 'related' });
          entry.origins.forEach((origin) => origins.add(origin));
        }
      }

      if (exact.length > 0) {
        return { tier: 'exact', keywords: exact, origins: [...origins], matches };
      }
      if (related.length > 0) {
        return { tier: 'related', keywords: related, origins: [...origins], matches };
      }
      return null;
    },
  };
}

/**
 * 관심 키워드별 상태. 후보 수는 잘라내기 전 전체를 세어야 "0건"이 정확해진다.
 *
 * 공급 후보가 0 이어도 수요 신호를 함께 조회한다 — "관심은 있는데 아직 안 판다"와
 * "관심도 수요도 없다"는 운영자가 해야 할 일이 전혀 다르기 때문이다.
 */
function buildInterestStatuses(
  keywords: Array<{ keyword: string; origins: ('saved' | 'seed')[] }>,
  scored: EntryRecommendation[],
  keywordIndex: PopularKeywordIndex,
  risingIndex: Map<string, EntryRisingCandidate>,
): EntryInterestKeywordStatus[] {
  return keywords.map((entry) => {
    const key = normalizeKeyword(entry.keyword);
    let exactCount = 0;
    let relatedCount = 0;

    for (const item of scored) {
      // 아이템 전체 tier 가 아니라 **이 키워드에 대한** tier 로 센다. 그래야 다른
      // 키워드가 exact 로 이겼다는 이유로 이 키워드의 매칭이 사라지지 않는다.
      const match = item.interest?.matches.find(
        (entry) => normalizeKeyword(entry.keyword) === key,
      );
      if (!match) continue;
      if (match.tier === 'exact') exactCount += 1;
      else relatedCount += 1;
    }

    const trend = keywordIndex.lookup(entry.keyword);
    const rising = risingIndex.get(key);
    const demand =
      trend || rising
        ? {
            boardLabel: trend?.boardLabel ?? null,
            boardRank: trend?.bestRank ?? null,
            risingScore: rising?.score ?? null,
            monthlySearchVolume: rising?.signals?.monthlySearchVolume ?? null,
          }
        : null;

    const total = exactCount + relatedCount;
    const state: EntryInterestState =
      total > 0 ? 'candidates' : demand ? 'demand_only' : 'no_signal';

    return { keyword: entry.keyword, origins: entry.origins, exactCount, relatedCount, state, demand };
  });
}

function indexRisingByKeyword(candidates: EntryRisingCandidate[]): Map<string, EntryRisingCandidate> {
  const index = new Map<string, EntryRisingCandidate>();
  for (const candidate of candidates) {
    const keyword = (candidate.keyword ?? '').trim();
    if (!keyword) continue;
    const key = normalizeKeyword(keyword);
    const existing = index.get(key);
    if (existing && (existing.score ?? 0) >= (candidate.score ?? 0)) continue;
    index.set(key, candidate);
  }
  return index;
}

function buildSourceStatus(
  key: EntrySourceKey,
  rowCount: number,
  businessDate: string | null,
  today: Date,
): EntrySourceStatus {
  return {
    key,
    label: SOURCE_LABELS[key],
    rowCount,
    businessDate: rowCount > 0 ? businessDate : null,
    staleDays: rowCount > 0 && businessDate ? diffDays(businessDate, today) : null,
  };
}

/**
 * 화면이 "왜 비었는지" 를 말할 수 있게 근거를 모은다.
 * 비어 있음을 조용히 넘기지 않는 것이 이 함수의 목적이다.
 */
function collectDataGaps(
  sources: EntrySourceStatus[],
  itemCount: number,
  interestKeywords: EntryInterestKeywordStatus[],
): string[] {
  const gaps: string[] = [];

  for (const source of sources) {
    if (source.rowCount === 0) {
      gaps.push(`${source.label} 데이터 없음 — 해당 소스는 점수에 반영되지 않았습니다.`);
      continue;
    }
    if (source.staleDays != null && source.staleDays >= 7) {
      gaps.push(`${source.label} 기준일 ${source.businessDate} (${source.staleDays}일 경과)`);
    }
  }

  if (itemCount === 0) {
    gaps.push('추천 가능한 상품이 없습니다 — 1688 신상품 수집을 먼저 실행하세요.');
  }

  // 관심 키워드를 등록해 뒀는데 후보가 없으면 조용히 넘기지 않는다.
  // 수요가 있는 쪽과 아예 신호가 없는 쪽은 할 일이 다르므로 따로 말한다.
  const demandOnly = interestKeywords.filter((entry) => entry.state === 'demand_only');
  if (demandOnly.length > 0) {
    gaps.push(
      `관심 키워드 ${demandOnly.length}개는 수요는 확인되는데 1688 공급 후보가 없습니다 (${demandOnly
        .map((entry) => entry.keyword)
        .join(', ')}) — 이 키워드로 1688 검색·수집을 돌리면 표에 올라옵니다.`,
    );
  }

  const noSignal = interestKeywords.filter((entry) => entry.state === 'no_signal');
  if (noSignal.length > 0) {
    gaps.push(
      `관심 키워드 ${noSignal.length}개는 수요 신호도 공급 후보도 없습니다 (${noSignal
        .map((entry) => entry.keyword)
        .join(', ')}).`,
    );
  }

  return gaps;
}

/**
 * 수집기가 값이 없을 때 '-' 나 'N/A' 같은 자리표시자를 태그로 넣는 경우가 있다.
 * 표에 그대로 나가면 의미 없는 칩이 되므로 걸러낸다.
 */
const PLACEHOLDER_TAGS = new Set(['-', '--', 'n/a', 'na', 'none', '없음', 'null']);

function collectTags(item: EntrySupplyItem): string[] {
  const tags = [...(item.purchaseTags ?? []), ...(item.supplierTags ?? [])]
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter((tag) => tag.length > 0 && !PLACEHOLDER_TAGS.has(tag.toLowerCase()));
  return [...new Set(tags)];
}

/**
 * 1688 수집기는 배송비를 따로 주지 않고 `landedCostKrw` 에 포함해 계산한다.
 * 없는 값을 "무료"로 표시하면 거짓말이 되므로 포함/미확인을 구분해 적는다.
 */
function resolveShippingLabel(item: EntrySupplyItem): string {
  if (item.landedCostKrw != null && Number.isFinite(item.landedCostKrw)) return '통관가 포함';
  return '미확인';
}

function normalizeKeyword(keyword: string): string {
  return keyword.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function parsePercent(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateKey(date: Date): string {
  return businessDateKey(date);
}

function diffDays(businessDate: string, today: Date): number {
  const from = parseBusinessDate(businessDate);
  const to = parseBusinessDate(toDateKey(today));
  if (!from || !to || from > to) return 0;
  return datesInclusive(from, to).length - 1;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function numberOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
