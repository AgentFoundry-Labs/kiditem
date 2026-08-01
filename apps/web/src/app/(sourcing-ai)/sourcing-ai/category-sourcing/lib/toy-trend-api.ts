import type { OperationRun } from '@kiditem/shared/operations';
import { apiClient } from '@/lib/api-client';
import { operationsApi } from '@/lib/operations-api';

export interface TrendSeed {
  id: string;
  keyword: string;
  sources: Array<'naver' | '1688' | 'shorts'>;
  enabled: boolean;
}

export interface TrendCollectResult {
  businessDate: string;
  results: Array<{
    source: 'naver' | '1688' | 'shorts';
    ok: boolean;
    collected: number;
    error?: string;
  }>;
}

export interface NaverKeywordSparklinePoint {
  businessDate: string;
  trendRatio: number | null;
  monthlyTotalSearchCount: number | null;
}

export interface NaverKeywordTrendView {
  keyword: string;
  latest: {
    businessDate: string;
    monthlyTotalSearchCount: number | null;
    monthlyPcSearchCount: number | null;
    monthlyMobileSearchCount: number | null;
    competitionIndex: string | null;
    averageAdRank: number | null;
    trendRatio: number | null;
    trendDelta: number | null;
  };
  sparkline: NaverKeywordSparklinePoint[];
}

export interface PopularKeywordBoardView {
  boardKey: string;
  boardLabel: string | null;
  latest: Array<{ rank: number; keyword: string }>;
  risers: Array<{ keyword: string; rankDelta: number | null }>;
}

export function collectNaverTrend(): Promise<OperationRun> {
  return operationsApi.start('sourcing.collect_daily_trends', {
    sourceSurface: 'domain_screen',
    input: { sources: ['naver'] },
  });
}

export async function fetchTrendSeeds(): Promise<TrendSeed[]> {
  const { seeds } = await apiClient.get<{ seeds: TrendSeed[] }>('/api/sourcing/trend/seeds');
  return seeds;
}

export function fetchNaverKeywordTrends(
  days: number,
): Promise<{ days: number; keywords: NaverKeywordTrendView[] }> {
  return apiClient.get<{ days: number; keywords: NaverKeywordTrendView[] }>(
    `/api/sourcing/trend/naver-keywords?days=${days}`,
  );
}

export function fetchPopularKeywordBoards(
  days: number,
): Promise<{ days: number; boards: PopularKeywordBoardView[] }> {
  return apiClient.get<{ days: number; boards: PopularKeywordBoardView[] }>(
    `/api/sourcing/trend/popular-keywords?days=${days}`,
  );
}
