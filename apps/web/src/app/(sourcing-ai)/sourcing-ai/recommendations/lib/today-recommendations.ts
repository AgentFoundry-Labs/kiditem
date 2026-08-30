import type { WingCatalogProduct } from '../../wing-catalog/lib/wing-catalog-presenter';

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

/**
 * Dashboard presentation shape for the normalized recommendation read model.
 * Score, grade, reasons, and observation values are assigned by the server;
 * this module only aggregates those values for the existing cards and tables.
 */
export type RecommendationGrade = 'A' | 'B' | 'C' | 'WATCH';

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
  salesLast3d: number | null;
  pvLast3d: number | null;
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

export function buildRecommendationSummary(rows: TodayRecommendationRow[]): TodayRecommendationSummary {
  const totalScore = rows.reduce((sum, row) => sum + row.score, 0);
  const keywordScore = new Map<string, number>();
  for (const row of rows) {
    keywordScore.set(row.primaryKeyword, (keywordScore.get(row.primaryKeyword) ?? 0) + row.score);
  }
  const strongestKeyword = [...keywordScore.entries()]
    .sort(([leftKeyword, leftScore], [rightKeyword, rightScore]) =>
      rightScore - leftScore || leftKeyword.localeCompare(rightKeyword, 'ko'),
    )[0]?.[0] ?? null;

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
): RisingKeywordOpportunity[] {
  const groups = new Map<string, TodayRecommendationRow[]>();
  for (const row of rows) {
    for (const keyword of row.keywords) {
      const normalized = keyword.trim();
      if (!normalized) continue;
      const group = groups.get(normalized) ?? [];
      group.push(row);
      groups.set(normalized, group);
    }
  }

  return [...groups.entries()]
    .map(([keyword, keywordRows]) => projectKeywordOpportunity(keyword, keywordRows))
    .sort((left, right) => right.score - left.score || left.keyword.localeCompare(right.keyword, 'ko'));
}

function projectKeywordOpportunity(
  keyword: string,
  rows: TodayRecommendationRow[],
): RisingKeywordOpportunity {
  const topRow = [...rows].sort(compareRows)[0] ?? null;
  const trackedRows = rows.filter((row) => row.threeDaySalesTracked);
  const conversionRows = rows.filter((row) => row.conversionRate28d != null);

  return {
    keyword,
    score: Math.round(rows.reduce((sum, row) => sum + row.score, 0) / Math.max(rows.length, 1)),
    grade: topRow?.grade ?? 'WATCH',
    candidateCount: rows.length,
    trackedProductCount: trackedRows.length,
    recentNewProductCount: rows.filter((row) => row.newEntrySignal > 0).length,
    strongProductCount: rows.filter((row) => row.grade === 'A' || row.grade === 'B').length,
    lowReviewProductCount: rows.filter((row) => (row.ratingCount ?? Number.MAX_SAFE_INTEGER) <= 80).length,
    totalSales3d: trackedRows.reduce((sum, row) => sum + (row.salesLast3d ?? 0), 0),
    totalViews3d: trackedRows.reduce((sum, row) => sum + (row.pvLast3d ?? 0), 0),
    averageConversionRate: conversionRows.length === 0
      ? 0
      : conversionRows.reduce((sum, row) => sum + (row.conversionRate28d ?? 0), 0) / conversionRows.length,
    topProductName: topRow?.productName ?? null,
    reasons: Array.from(new Set(rows.flatMap((row) => row.reasons))).slice(0, 3),
  };
}

function compareRows(left: TodayRecommendationRow, right: TodayRecommendationRow): number {
  return right.score - left.score || gradeWeight(right.grade) - gradeWeight(left.grade);
}

function gradeWeight(grade: RecommendationGrade): number {
  if (grade === 'A') return 4;
  if (grade === 'B') return 3;
  if (grade === 'C') return 2;
  return 1;
}
