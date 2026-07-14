import { apiClient } from '@/lib/api-client';
import { isStationeryToyKeyword } from './stationery-toy-keyword';
import type { TrendOpportunity } from './market-intelligence';

const DISCOVERY_SEEDS = ['완구', '장난감', '문구', '키링', '만들기'];
const MAX_TREND_CANDIDATES = 50;

interface SearchTrendItem {
  keyword: string;
  latestRatio: number;
  previousAverageRatio: number;
  trendDelta: number;
  trendRate: number | null;
  data: Array<{ period: string; ratio: number }>;
}

interface SearchTrendResponse {
  source: 'naver-datalab-search-trend';
  generatedAt: string;
  items: SearchTrendItem[];
}

interface RelatedKeywordItem {
  keyword: string;
  monthlyTotalSearchCount: number | null;
  competitionIndex: string | null;
}

interface RelatedKeywordResponse {
  source: 'naver-searchad-keywordstool';
  generatedAt: string;
  items: RelatedKeywordItem[];
}

export interface LiveNaverMarketResult {
  source: 'naver-live';
  generatedAt: string;
  opportunities: TrendOpportunity[];
  warnings: string[];
}

/**
 * 네이버 검색광고 키워드도구에서 문구·완구 관련어와 월간 검색량을 직접
 * 가져오고, 상위 후보를 공식 DataLab 검색 추이로 재정렬한다. 특정 시드
 * 범위의 급상승 후보이며 네이버 전체 검색어의 절대 순위는 아니다.
 */
export async function fetchLiveNaverMarket(): Promise<LiveNaverMarketResult> {
  const related = await apiClient.post<RelatedKeywordResponse>(
    '/api/sourcing/keyword-research/naver/related-keywords',
    { seedKeywords: DISCOVERY_SEEDS, maxResults: 100 },
  );
  const candidates = normalizeRelatedCandidates(related.items).slice(0, MAX_TREND_CANDIDATES);
  if (candidates.length === 0) {
    throw new Error('네이버 검색광고 키워드도구가 문구·완구 관련어를 반환하지 않았습니다.');
  }

  const warnings: string[] = [];
  let trends: SearchTrendResponse | null = null;
  try {
    trends = await apiClient.post<SearchTrendResponse>(
      '/api/sourcing/keyword-research/naver/datalab/search-trends',
      { keywords: candidates.map((item) => item.keyword), timeUnit: 'date' },
    );
  } catch (error) {
    warnings.push(`검색 추이 수집 실패: ${errorMessage(error)}`);
  }

  return buildLiveNaverMarketResult({
    related,
    trends,
    warnings,
  });
}

export function buildLiveNaverMarketResult(input: {
  related: RelatedKeywordResponse;
  trends: SearchTrendResponse | null;
  warnings?: string[];
}): LiveNaverMarketResult {
  const candidates = normalizeRelatedCandidates(input.related.items).slice(0, MAX_TREND_CANDIDATES);
  const trendByKeyword = new Map(
    (input.trends?.items ?? []).map((item) => [compactKeyword(item.keyword), item]),
  );
  const maxVolume = Math.max(...candidates.map((item) => item.monthlyTotalSearchCount ?? 0), 1);

  const opportunities = candidates
    .map((candidate) => {
      const trend = trendByKeyword.get(compactKeyword(candidate.keyword));
      const momentum = trend?.trendRate == null
        ? 0
        : round(clamp(trend.trendRate * 100, -99.9, 999.9), 1);
      const volumeScore = Math.round(
        (Math.log1p(candidate.monthlyTotalSearchCount ?? 0) / Math.log1p(maxVolume)) * 100,
      );
      const trendScore = trend ? clamp(50 + momentum / 2, 0, 100) : 25;
      const score = Math.round(volumeScore * 0.4 + trendScore * 0.6);
      const competition = normalizeCompetition(candidate.competitionIndex);
      const rightsCheckRequired = looksLikeLicensedKeyword(candidate.keyword);
      const points = (trend?.data ?? []).slice(-7).map((point) => ({
        date: point.period.slice(5),
        search: round(point.ratio, 1),
        commerce: volumeScore,
        social: 0,
      }));

      return {
        id: `live-naver-${compactKeyword(candidate.keyword)}`,
        keyword: candidate.keyword,
        category: classifyCategory(candidate.keyword),
        trendRank: 0,
        previousTrendRank: null,
        score,
        decision: rightsCheckRequired
          ? 'licensed' as const
          : score >= 72 && competition !== '높음' ? 'focus' as const : 'test' as const,
        monthlySearches: candidate.monthlyTotalSearchCount,
        shoppingRank: null,
        momentum,
        competition,
        sources: ['NAVER' as const],
        evidence: `네이버 검색광고 월간 검색 ${candidate.monthlyTotalSearchCount?.toLocaleString('ko-KR') ?? '집계 중'}${
          trend
            ? ` · 최근 검색지수 ${formatRatio(trend.latestRatio)} (이전 평균 ${formatRatio(trend.previousAverageRatio)})`
            : ''
        } · 경쟁 ${competition}`,
        nextAction: rightsCheckRequired
          ? '상표·캐릭터 정식 유통 증빙이 확인되는 상품만 검토하고 무단 IP 상품은 제외하세요.'
          : competition === '높음'
          ? '경쟁 상품의 가격·리뷰 장벽을 먼저 확인하고 구매 의도가 더 구체적인 하위 키워드로 좁히세요.'
          : '쿠팡 검색결과와 1688 공급가를 이어서 확인한 뒤 30~100개 단위로 검증하세요.',
        points: points.length > 0
          ? points
          : [{ date: '현재', search: 0, commerce: volumeScore, social: 0 }],
      } satisfies TrendOpportunity;
    })
    .sort((a, b) => b.score - a.score || b.momentum - a.momentum || (b.monthlySearches ?? 0) - (a.monthlySearches ?? 0))
    .slice(0, 20)
    .map((opportunity, index) => ({ ...opportunity, trendRank: index + 1 }));

  return {
    source: 'naver-live',
    generatedAt: input.trends?.generatedAt ?? input.related.generatedAt,
    opportunities,
    warnings: input.warnings ?? [],
  };
}

function normalizeRelatedCandidates(items: RelatedKeywordItem[]): RelatedKeywordItem[] {
  const byKeyword = new Map<string, RelatedKeywordItem>();
  for (const item of items) {
    const keyword = item.keyword.trim();
    const key = compactKeyword(keyword);
    if (
      !key
      || keyword.length < 2
      || item.monthlyTotalSearchCount == null
      || !isStationeryToyKeyword(keyword)
    ) continue;
    const existing = byKeyword.get(key);
    if (!existing || (item.monthlyTotalSearchCount ?? 0) > (existing.monthlyTotalSearchCount ?? 0)) {
      byKeyword.set(key, { ...item, keyword });
    }
  }
  return [...byKeyword.values()].sort(
    (a, b) => (b.monthlyTotalSearchCount ?? 0) - (a.monthlyTotalSearchCount ?? 0),
  );
}

function classifyCategory(keyword: string): 'toy' | 'stationery' {
  return /문구|스티커|키링|키홀더|필통|연필|펜|노트|다이어리|메모|지우개|가위|테이프|비즈|공예|만들기|색칠/.test(keyword)
    ? 'stationery'
    : 'toy';
}

function looksLikeLicensedKeyword(keyword: string): boolean {
  return /포켓몬|산리오|티니핑|터닝메카드|헬로카봇|뽀로로|타요|브레드이발소|시크릿쥬쥬|또봇|레고|디즈니|마블|짱구|쿠로미|마이멜로디/i.test(keyword);
}

function compactKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function normalizeCompetition(value: string | null | undefined): '낮음' | '중간' | '높음' {
  if (!value) return '중간';
  const normalized = value.trim().toLocaleLowerCase('ko-KR');
  if (normalized === '높음' || normalized === 'high') return '높음';
  if (normalized === '낮음' || normalized === 'low') return '낮음';
  return '중간';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function formatRatio(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류';
}
