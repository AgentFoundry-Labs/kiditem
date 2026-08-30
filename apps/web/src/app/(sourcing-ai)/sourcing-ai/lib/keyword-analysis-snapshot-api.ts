import { apiClient } from '@/lib/api-client';
import {
  SourcingKeywordAnalysisSnapshotResponseSchema,
  type SourcingKeywordAnalysisInput,
  type SourcingKeywordAnalysisSnapshot,
  type SourcingNaverAutocompleteKeyword,
  type SourcingNaverAutocompleteKeywordResult,
  type SourcingNaverDatalabKeywordTrend,
  type SourcingNaverDatalabPopularKeywordBoard,
  type SourcingNaverDatalabPopularKeywordBoardKey,
  type SourcingNaverDatalabPopularKeywordResult,
  type SourcingNaverDatalabPopularKeywordRank,
  type SourcingNaverDatalabSearchTrendResult,
  type SourcingNaverDatalabTrendPoint,
  type SourcingNaverRelatedKeyword,
  type SourcingNaverRelatedKeywordResult,
} from '@kiditem/shared/sourcing';

export type NaverDatalabTimeUnit = SourcingKeywordAnalysisInput['timeUnit'];
export type NaverDatalabGender = Exclude<SourcingKeywordAnalysisInput['gender'], 'all'>;
export type NaverDatalabDevice = Exclude<SourcingKeywordAnalysisInput['device'], 'all'>;
export type NaverDatalabPopularKeywordBoardKey = SourcingNaverDatalabPopularKeywordBoardKey;
export type NaverRelatedKeyword = SourcingNaverRelatedKeyword;
export type NaverAutocompleteKeyword = SourcingNaverAutocompleteKeyword;
export type SearchNaverAutocompleteKeywordsResult = SourcingNaverAutocompleteKeywordResult;
export type SearchNaverRelatedKeywordsResult = SourcingNaverRelatedKeywordResult;
export type NaverDatalabTrendPoint = SourcingNaverDatalabTrendPoint;
export type NaverDatalabKeywordTrend = SourcingNaverDatalabKeywordTrend;
export type CompareNaverDatalabSearchTrendsResult = SourcingNaverDatalabSearchTrendResult;
export type NaverDatalabPopularKeywordRank = SourcingNaverDatalabPopularKeywordRank;
export type NaverDatalabPopularKeywordBoard = SourcingNaverDatalabPopularKeywordBoard;
export type SearchNaverDatalabPopularKeywordsResult =
  SourcingNaverDatalabPopularKeywordResult;
export type KeywordAnalysisAction = SourcingKeywordAnalysisInput['action'];
export type KeywordAnalysisFocusMode = SourcingKeywordAnalysisInput['focusMode'];
export type KeywordAnalysisInput = SourcingKeywordAnalysisInput & Record<string, unknown>;
export type KeywordAnalysisSnapshot = SourcingKeywordAnalysisSnapshot;

export function keywordAnalysisInput(
  action: KeywordAnalysisAction,
  overrides: Partial<KeywordAnalysisInput> = {},
): KeywordAnalysisInput {
  return {
    action,
    timeUnit: 'date',
    gender: 'all',
    age: 'all',
    device: 'all',
    selectedBoardKey: 'all',
    rankLimit: 20,
    focusMode: 'all',
    finalLimit: 30,
    ...overrides,
  };
}

export function keywordAnalysisSnapshotQueryKey(input: KeywordAnalysisInput) {
  return ['sourcing', 'keyword-analysis', 'snapshot', JSON.stringify(input)] as const;
}

export function fetchKeywordAnalysisSnapshot(
  input: KeywordAnalysisInput,
): Promise<KeywordAnalysisSnapshot | null> {
  const query = encodeURIComponent(JSON.stringify(input));
  return apiClient.getNullable<unknown>(
    `/api/sourcing/keyword-analysis/snapshot?input=${query}`,
  ).then((raw) => SourcingKeywordAnalysisSnapshotResponseSchema.parse(raw));
}
