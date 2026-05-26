import type { WingCatalogProduct } from '../../wing-catalog/lib/wing-catalog-extension';

export const DEFAULT_TODAY_RECOMMENDATION_KEYWORDS = [
  '슬라임',
  '잔디인형',
  '키즈 우산',
  '어린이 물총',
  '유아 목욕놀이',
  '초등 필통',
  '키즈 선글라스',
  '아기 쿨매트',
  '어린이 보드게임',
  '유아 물놀이 장난감',
  '어린이 헤어핀',
  '키즈 양말',
  '모래놀이 장난감',
  '스티커북',
  '어린이 앞치마',
  '아기 물컵',
  '키즈 방수팩',
  '어린이 캐리어',
  '유아 퍼즐',
  '키즈 캠핑의자',
];

export const TODAY_RECOMMENDATION_ROWS_STORAGE_KEY = 'kiditem:sourcing-ai:today-recommendation:rows';
export const TODAY_RECOMMENDATION_SNAPSHOTS_STORAGE_KEY = 'kiditem:sourcing-ai:today-recommendation:snapshots';
export const TODAY_RECOMMENDATION_ROWS_UPDATED_EVENT = 'kiditem:sourcing-ai:today-recommendation-rows-updated';
export const TODAY_RECOMMENDATION_SNAPSHOTS_UPDATED_EVENT = 'kiditem:sourcing-ai:today-recommendation-snapshots-updated';
export const THREE_DAY_TRACKING_MS = 3 * 24 * 60 * 60 * 1000;

const PRODUCT_TRACKING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_STORED_PRODUCT_SNAPSHOTS = 2000;

export type RecommendationGrade = 'A' | 'B' | 'C' | 'WATCH' | 'EXCLUDE';

export interface ProductSnapshot {
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  salesLast28d: number | null;
  pvLast28Day: number | null;
  ratingCount: number | null;
  salePrice: number | null;
  capturedAt: number;
  firstSeenAt?: number;
  lastSeenAt?: number;
  seenCount?: number;
  keywords?: string[];
}

export interface TodayRecommendationRow extends WingCatalogProduct {
  keywords: string[];
  primaryKeyword: string;
  score: number;
  grade: RecommendationGrade;
  reasons: string[];
  risks: string[];
  lowReviewSalesPower: number;
  marketReactionSignal: number;
  newEntrySignal: number;
  salesLast3d: number;
  pvLast3d: number;
  threeDaySalesTracked: boolean;
  threeDayTrackingDays: number | null;
  salesDelta: number | null;
  viewDelta: number | null;
  reviewDelta: number | null;
}

export interface RisingKeywordOpportunity {
  keyword: string;
  score: number;
  grade: RecommendationGrade;
  candidateCount: number;
  trackedProductCount: number;
  recentNewProductCount: number;
  strongProductCount: number;
  lowReviewProductCount: number;
  totalSales3d: number;
  totalViews3d: number;
  averageConversionRate: number;
  topProductName: string | null;
  reasons: string[];
}

export interface TodayRecommendationSummary {
  totalCandidates: number;
  aCount: number;
  bCount: number;
  watchCount: number;
  averageScore: number;
  strongestKeyword: string | null;
}

export interface ProductTrackingSummary {
  trackedProductCount: number;
  recentNewProductCount: number;
  oldestFirstSeenAt: number | null;
  newestFirstSeenAt: number | null;
}

export function buildTodayRecommendationRows(input: {
  keyword: string;
  products: WingCatalogProduct[];
  previousSnapshots?: Map<string, ProductSnapshot>;
}): TodayRecommendationRow[] {
  return input.products.map((product) => {
    const previous = input.previousSnapshots?.get(snapshotKey(product)) ?? null;
    return scoreProductForTodayRecommendation(product, input.keyword, previous);
  });
}

export function mergeTodayRecommendationRows(rows: TodayRecommendationRow[]): TodayRecommendationRow[] {
  const merged = new Map<string, TodayRecommendationRow>();

  for (const row of rows) {
    const key = snapshotKey(row);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row, keywords: [...row.keywords] });
      continue;
    }
    const keywords = Array.from(new Set([...current.keywords, ...row.keywords]));
    if (row.score > current.score) {
      merged.set(key, { ...row, keywords });
    } else {
      current.keywords = keywords;
    }
  }

  return [...merged.values()]
    .filter((row) => row.grade !== 'EXCLUDE')
    .sort((a, b) => b.score - a.score);
}

export function buildRecommendationSummary(rows: TodayRecommendationRow[]): TodayRecommendationSummary {
  const totalScore = rows.reduce((sum, row) => sum + row.score, 0);
  const keywordScore = new Map<string, number>();
  for (const row of rows) {
    keywordScore.set(row.primaryKeyword, (keywordScore.get(row.primaryKeyword) ?? 0) + row.score);
  }
  const strongestKeyword = [...keywordScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    totalCandidates: rows.length,
    aCount: rows.filter((row) => row.grade === 'A').length,
    bCount: rows.filter((row) => row.grade === 'B').length,
    watchCount: rows.filter((row) => row.grade === 'WATCH').length,
    averageScore: rows.length === 0 ? 0 : Math.round(totalScore / rows.length),
    strongestKeyword,
  };
}

export function buildRisingKeywordOpportunities(
  rows: TodayRecommendationRow[],
  tracking?: {
    snapshots?: ProductSnapshot[] | Map<string, ProductSnapshot>;
    now?: number;
    recentWindowMs?: number;
  },
): RisingKeywordOpportunity[] {
  const groups = new Map<string, TodayRecommendationRow[]>();
  const snapshotMap = tracking?.snapshots
    ? tracking.snapshots instanceof Map
      ? tracking.snapshots
      : snapshotsToLatestMap(tracking.snapshots)
    : null;
  const now = tracking?.now ?? Date.now();
  const recentWindowMs = tracking?.recentWindowMs ?? THREE_DAY_TRACKING_MS;

  for (const row of rows) {
    for (const keyword of row.keywords) {
      const bucket = groups.get(keyword) ?? [];
      bucket.push(row);
      groups.set(keyword, bucket);
    }
  }

  return [...groups.entries()]
    .map(([keyword, keywordRows]) => scoreKeywordOpportunity(keyword, keywordRows, snapshotMap, now, recentWindowMs))
    .sort((a, b) => b.score - a.score);
}

export function makeProductSnapshots(
  rows: TodayRecommendationRow[],
  capturedAt = Date.now(),
  previousSnapshots: ProductSnapshot[] = [],
): ProductSnapshot[] {
  const previousMap = snapshotsToLatestMap(previousSnapshots);

  return rows.map((row) => ({
    ...productSnapshotFromRow(row, previousMap.get(snapshotKey(row)), capturedAt),
  }));
}

export function appendProductSnapshots(
  rows: TodayRecommendationRow[],
  previousSnapshots: ProductSnapshot[],
  capturedAt = Date.now(),
): ProductSnapshot[] {
  const cutoff = capturedAt - PRODUCT_TRACKING_RETENTION_MS;
  const currentSnapshots = makeProductSnapshots(rows, capturedAt, previousSnapshots);
  const currentSignatures = new Set(currentSnapshots.map(snapshotSignature));
  const retainedSnapshots = previousSnapshots
    .filter((snapshot) => (snapshot.lastSeenAt ?? snapshot.capturedAt) >= cutoff)
    .filter((snapshot) => !currentSignatures.has(snapshotSignature(snapshot)));

  return [...currentSnapshots, ...retainedSnapshots]
    .sort((a, b) => (b.lastSeenAt ?? b.capturedAt) - (a.lastSeenAt ?? a.capturedAt))
    .slice(0, MAX_STORED_PRODUCT_SNAPSHOTS);
}

export function snapshotsToMap(snapshots: ProductSnapshot[], now = Date.now()): Map<string, ProductSnapshot> {
  const cutoff = now - THREE_DAY_TRACKING_MS;
  const baselines = new Map<string, ProductSnapshot>();

  for (const snapshot of snapshots) {
    if (snapshot.capturedAt < cutoff || snapshot.capturedAt > now) continue;
    const key = snapshotKey(snapshot);
    const current = baselines.get(key);
    if (!current || snapshot.capturedAt < current.capturedAt) {
      baselines.set(key, snapshot);
    }
  }

  return baselines;
}

export function snapshotsToLatestMap(snapshots: ProductSnapshot[]): Map<string, ProductSnapshot> {
  const latest = new Map<string, ProductSnapshot>();

  for (const snapshot of snapshots) {
    const key = snapshotKey(snapshot);
    const current = latest.get(key);
    if (!current || (snapshot.lastSeenAt ?? snapshot.capturedAt) > (current.lastSeenAt ?? current.capturedAt)) {
      latest.set(key, snapshot);
    }
  }

  return latest;
}

export function buildProductTrackingSummary(
  rows: TodayRecommendationRow[],
  snapshots: ProductSnapshot[] | Map<string, ProductSnapshot>,
  now = Date.now(),
  recentWindowMs = THREE_DAY_TRACKING_MS,
): ProductTrackingSummary {
  const snapshotMap = snapshots instanceof Map ? snapshots : snapshotsToLatestMap(snapshots);
  const currentSnapshots = rows
    .map((row) => snapshotMap.get(snapshotKey(row)) ?? null)
    .filter((snapshot): snapshot is ProductSnapshot => snapshot != null);
  const firstSeenValues = currentSnapshots
    .map((snapshot) => snapshot.firstSeenAt ?? snapshot.capturedAt)
    .filter((value) => Number.isFinite(value));

  return {
    trackedProductCount: currentSnapshots.length,
    recentNewProductCount: currentSnapshots.filter((snapshot) => isRecentlyFirstSeen(snapshot, now, recentWindowMs)).length,
    oldestFirstSeenAt: firstSeenValues.length > 0 ? Math.min(...firstSeenValues) : null,
    newestFirstSeenAt: firstSeenValues.length > 0 ? Math.max(...firstSeenValues) : null,
  };
}

export function readTodayRecommendationRows(): TodayRecommendationRow[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(TODAY_RECOMMENDATION_ROWS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter(isTodayRecommendationRow) : [];
  } catch {
    return [];
  }
}

export function writeTodayRecommendationRows(rows: TodayRecommendationRow[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TODAY_RECOMMENDATION_ROWS_STORAGE_KEY, JSON.stringify(rows.slice(0, 100)));
  window.dispatchEvent(new Event(TODAY_RECOMMENDATION_ROWS_UPDATED_EVENT));
}

export function readTodayRecommendationSnapshots(): ProductSnapshot[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(TODAY_RECOMMENDATION_SNAPSHOTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isProductSnapshot) : [];
  } catch {
    return [];
  }
}

export function writeTodayRecommendationSnapshots(snapshots: ProductSnapshot[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    TODAY_RECOMMENDATION_SNAPSHOTS_STORAGE_KEY,
    JSON.stringify(snapshots.slice(0, MAX_STORED_PRODUCT_SNAPSHOTS)),
  );
  window.dispatchEvent(new Event(TODAY_RECOMMENDATION_SNAPSHOTS_UPDATED_EVENT));
}

function scoreProductForTodayRecommendation(
  product: WingCatalogProduct,
  keyword: string,
  previous: ProductSnapshot | null,
): TodayRecommendationRow {
  const now = Date.now();
  const salesSignal = buildThreeDaySignal(product.salesLast28d, previous?.salesLast28d ?? null, previous?.capturedAt ?? null, now);
  const viewSignal = buildThreeDaySignal(product.pvLast28Day, previous?.pvLast28Day ?? null, previous?.capturedAt ?? null, now);
  const sales = salesSignal.value;
  const views = viewSignal.value;
  const reviews = product.ratingCount ?? 0;
  const price = product.salePrice ?? 0;
  const conversionRate = product.conversionRate28d ?? (views > 0 ? sales / views : 0);
  const lowReviewSalesPower = sales / Math.max(reviews, 1);
  const salesDelta = salesSignal.tracked ? salesSignal.value : null;
  const viewDelta = viewSignal.tracked ? viewSignal.value : null;
  const reviewDelta = previous?.ratingCount == null || !isRecentSnapshot(previous.capturedAt, now)
    ? null
    : Math.max(0, reviews - previous.ratingCount);

  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0;

  score += Math.min(24, sales / 1.4);
  if (sales >= 30) reasons.push('최근 3일 판매량 강함');
  else if (sales >= 8) reasons.push('최근 3일 판매 반응 확인');

  score += Math.min(18, conversionRate * 360);
  if (conversionRate >= 0.05) reasons.push('조회 대비 구매 전환 좋음');

  if (reviews <= 50 && sales >= 12) {
    score += 24;
    reasons.unshift('저리뷰인데 판매 발생');
  } else if (reviews <= 300 && sales >= 15) {
    score += 18;
    reasons.unshift('리뷰 장벽 낮은 판매 상품');
  } else if (reviews <= 1000) {
    score += 8;
  } else if (reviews > 3000) {
    score -= 18;
    risks.push('리뷰 장벽 높음');
  } else {
    score -= 6;
  }

  if (salesDelta != null && salesDelta > 0) {
    score += Math.min(10, salesDelta * 2);
    reasons.push('3일 추적 판매 증가');
  }

  score += Math.min(16, lowReviewSalesPower * 4);
  if (lowReviewSalesPower >= 3) reasons.push('판매량/리뷰 비율 우수');

  if (price >= 9900 && price <= 39900) {
    score += 12;
    reasons.push('테스트하기 좋은 가격대');
  } else if (price >= 7000 && price <= 59900) {
    score += 7;
  } else if (price > 0) {
    score += 2;
    risks.push(price < 7000 ? '단가 낮음' : '가격대 높음');
  }
  if (reviewDelta != null && reviewDelta > 0 && reviews <= 1000) {
    score += Math.min(8, reviewDelta * 2);
    reasons.push('최근 리뷰 증가');
  }
  if (viewDelta != null && viewDelta > 0) score += Math.min(5, viewDelta / 300);

  const riskPenalty = riskKeywordPenalty(product.productName);
  score -= riskPenalty.penalty;
  risks.push(...riskPenalty.risks);

  if (sales < 2 || views < 20) {
    score -= 18;
    risks.push('반응 데이터 부족');
  }

  const roundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const marketReactionSignal = Math.round((lowReviewSalesPower * 6 + conversionRate * 220 + Math.min(20, sales / 2)) * 10) / 10;

  return {
    ...product,
    keywords: [keyword],
    primaryKeyword: keyword,
    score: roundedScore,
    grade: gradeFromScore(roundedScore, sales, reviews),
    reasons: reasons.slice(0, 4),
    risks: Array.from(new Set(risks)).slice(0, 3),
    lowReviewSalesPower,
    marketReactionSignal,
    newEntrySignal: Math.round(lowReviewSalesPower * 10) / 10,
    salesLast3d: sales,
    pvLast3d: views,
    threeDaySalesTracked: salesSignal.tracked,
    threeDayTrackingDays: salesSignal.trackingDays ?? viewSignal.trackingDays,
    salesDelta,
    viewDelta,
    reviewDelta,
  };
}

function scoreKeywordOpportunity(
  keyword: string,
  rows: TodayRecommendationRow[],
  snapshots: Map<string, ProductSnapshot> | null,
  now: number,
  recentWindowMs: number,
): RisingKeywordOpportunity {
  const candidateCount = rows.length;
  const trackedProductCount = snapshots == null
    ? 0
    : rows.filter((row) => snapshots.has(snapshotKey(row))).length;
  const recentNewProductCount = snapshots == null
    ? 0
    : rows.filter((row) => isRecentlyFirstSeen(snapshots.get(snapshotKey(row)), now, recentWindowMs)).length;
  const strongProductCount = rows.filter((row) => row.grade === 'A' || row.grade === 'B').length;
  const lowReviewProductCount = rows.filter((row) => row.ratingCount != null && row.ratingCount <= 80 && getSalesLast3d(row) >= 5).length;
  const totalSales3d = rows.reduce((sum, row) => sum + getSalesLast3d(row), 0);
  const totalViews3d = rows.reduce((sum, row) => sum + getViewsLast3d(row), 0);
  const averageConversionRate = totalViews3d > 0 ? totalSales3d / totalViews3d : 0;
  const topRow = [...rows].sort((a, b) => b.score - a.score)[0] ?? null;

  let score = 0;
  score += Math.min(28, strongProductCount * 9);
  score += Math.min(24, lowReviewProductCount * 8);
  score += Math.min(24, totalSales3d / 5);
  score += Math.min(16, averageConversionRate * 260);
  score += Math.min(12, recentNewProductCount * 4);
  score += Math.min(8, candidateCount * 1.5);

  const reasons: string[] = [];
  if (recentNewProductCount > 0) reasons.push('최근 3일 신규 관측 상품 존재');
  if (strongProductCount > 0) reasons.push('A/B급 상품 반응 확인');
  if (lowReviewProductCount > 0) reasons.push('저리뷰 판매 상품 존재');
  if (totalSales3d >= 30) reasons.push('키워드 내 3일 판매량 합계 강함');
  if (averageConversionRate >= 0.04) reasons.push('조회 대비 구매 전환 좋음');
  if (candidateCount >= 5) reasons.push('후보 상품 폭 확인');

  const roundedScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    keyword,
    score: roundedScore,
    grade: gradeFromScore(roundedScore, totalSales3d, Math.min(...rows.map((row) => row.ratingCount ?? 999999))),
    candidateCount,
    trackedProductCount,
    recentNewProductCount,
    strongProductCount,
    lowReviewProductCount,
    totalSales3d,
    totalViews3d,
    averageConversionRate,
    topProductName: topRow?.productName ?? null,
    reasons: reasons.slice(0, 3),
  };
}

function gradeFromScore(score: number, sales: number, reviews: number): RecommendationGrade {
  if (score >= 72 && sales >= 18 && reviews <= 1200) return 'A';
  if (score >= 55 && sales >= 8 && reviews <= 2500) return 'B';
  if (score >= 40) return 'C';
  if (score >= 28) return 'WATCH';
  return 'EXCLUDE';
}

function buildThreeDaySignal(
  current28d: number | null | undefined,
  previous28d: number | null,
  previousCapturedAt: number | null,
  now: number,
): { value: number; tracked: boolean; trackingDays: number | null } {
  const current = Math.max(0, current28d ?? 0);

  if (previous28d != null && previousCapturedAt != null && isRecentSnapshot(previousCapturedAt, now)) {
    const ageMs = Math.max(0, now - previousCapturedAt);
    return {
      value: Math.max(0, current - previous28d),
      tracked: true,
      trackingDays: Math.max(1, Math.ceil(ageMs / (24 * 60 * 60 * 1000))),
    };
  }

  return {
    value: estimateThreeDayFromTwentyEightDay(current),
    tracked: false,
    trackingDays: null,
  };
}

function isRecentSnapshot(capturedAt: number, now: number): boolean {
  return capturedAt <= now && capturedAt >= now - THREE_DAY_TRACKING_MS;
}

function getSalesLast3d(row: Pick<TodayRecommendationRow, 'salesLast3d' | 'salesLast28d'>): number {
  return row.salesLast3d ?? estimateThreeDayFromTwentyEightDay(row.salesLast28d ?? 0);
}

function getViewsLast3d(row: Pick<TodayRecommendationRow, 'pvLast3d' | 'pvLast28Day'>): number {
  return row.pvLast3d ?? estimateThreeDayFromTwentyEightDay(row.pvLast28Day ?? 0);
}

function estimateThreeDayFromTwentyEightDay(value: number): number {
  return Math.max(0, Math.round((value / 28) * 3));
}

function productSnapshotFromRow(
  row: TodayRecommendationRow,
  previous: ProductSnapshot | undefined,
  capturedAt: number,
): ProductSnapshot {
  return {
    productId: row.productId,
    itemId: row.itemId,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
    salesLast28d: row.salesLast28d,
    pvLast28Day: row.pvLast28Day,
    ratingCount: row.ratingCount,
    salePrice: row.salePrice,
    capturedAt,
    firstSeenAt: previous?.firstSeenAt ?? previous?.capturedAt ?? capturedAt,
    lastSeenAt: capturedAt,
    seenCount: (previous?.seenCount ?? 0) + 1,
    keywords: Array.from(new Set([...(previous?.keywords ?? []), ...row.keywords])),
  };
}

function isRecentlyFirstSeen(snapshot: ProductSnapshot | null | undefined, now: number, recentWindowMs: number): boolean {
  if (!snapshot) return false;
  const firstSeenAt = snapshot.firstSeenAt ?? snapshot.capturedAt;
  return firstSeenAt >= now - recentWindowMs && firstSeenAt <= now;
}

function snapshotSignature(snapshot: ProductSnapshot): string {
  return `${snapshotKey(snapshot)}:${snapshot.capturedAt}`;
}

function riskKeywordPenalty(productName: string): { penalty: number; risks: string[] } {
  const risks: string[] = [];
  let penalty = 0;
  const normalized = productName.toLowerCase();
  const riskyTerms = ['산리오', '포켓몬', '디즈니', '마블', '짱구', '캐릭터', '정품', '호환'];
  if (riskyTerms.some((term) => normalized.includes(term.toLowerCase()))) {
    penalty += 14;
    risks.push('IP/브랜드 리스크');
  }
  if (normalized.includes('kc') || normalized.includes('인증')) {
    penalty += 4;
    risks.push('인증 확인 필요');
  }
  return { penalty, risks };
}

function snapshotKey(product: Pick<WingCatalogProduct, 'productId' | 'itemId' | 'vendorItemId'>): string {
  return `${product.productId}:${product.itemId ?? ''}:${product.vendorItemId ?? ''}`;
}

function isTodayRecommendationRow(value: unknown): value is TodayRecommendationRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<TodayRecommendationRow>;
  return typeof row.productId === 'string' &&
    typeof row.productName === 'string' &&
    typeof row.primaryKeyword === 'string' &&
    typeof row.score === 'number' &&
    typeof row.grade === 'string';
}

function isProductSnapshot(value: unknown): value is ProductSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<ProductSnapshot>;
  return typeof snapshot.productId === 'string' &&
    typeof snapshot.productName === 'string' &&
    typeof snapshot.capturedAt === 'number';
}
