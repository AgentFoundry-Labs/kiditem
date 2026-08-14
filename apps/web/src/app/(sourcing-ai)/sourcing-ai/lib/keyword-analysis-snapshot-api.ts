import { apiClient } from '@/lib/api-client';

export type NaverDatalabTimeUnit = 'date' | 'week' | 'month';
export type NaverDatalabGender = 'm' | 'f';
export type NaverDatalabDevice = 'pc' | 'mo';
export type NaverDatalabPopularKeywordBoardKey =
  | 'all_categories'
  | 'birth_kids'
  | 'toys_dolls'
  | 'stationery_office'
  | 'kids_fashion'
  | 'toys_block'
  | 'toys_action'
  | 'fancy_sticker'
  | 'fancy_goods'
  | 'stationery_writing'
  | 'toys_roleplay'
  | 'toys_puzzle'
  | 'fancy_diary'
  | 'stationery_note';

export interface NaverRelatedKeyword {
  keyword: string;
  monthlyPcSearchCount: number | null;
  monthlyMobileSearchCount: number | null;
  monthlyTotalSearchCount: number | null;
  monthlyPcClickCount: number | null;
  monthlyMobileClickCount: number | null;
  monthlyTotalClickCount: number | null;
  monthlyPcClickRate: number | null;
  monthlyMobileClickRate: number | null;
  averageAdRank: number | null;
  competitionIndex: string | null;
}

export interface NaverAutocompleteKeyword {
  keyword: string;
  rank: number;
  source: 'naver-search-autocomplete';
}

export interface SearchNaverAutocompleteKeywordsResult {
  source: 'naver-search-autocomplete';
  keyword: string;
  generatedAt: string;
  items: NaverAutocompleteKeyword[];
}

export interface SearchNaverRelatedKeywordsResult {
  source: 'naver-searchad-keywordstool';
  seedKeywords: string[];
  generatedAt: string;
  items: NaverRelatedKeyword[];
}

export interface NaverDatalabTrendPoint {
  period: string;
  ratio: number;
}

export interface NaverDatalabKeywordTrend {
  keyword: string;
  latestRatio: number;
  previousAverageRatio: number;
  peakRatio: number;
  trendDelta: number;
  trendRate: number | null;
  data: NaverDatalabTrendPoint[];
}

export interface CompareNaverDatalabSearchTrendsResult {
  source: 'naver-datalab-search-trend';
  keywords: string[];
  startDate: string;
  endDate: string;
  timeUnit: NaverDatalabTimeUnit;
  generatedAt: string;
  items: NaverDatalabKeywordTrend[];
}

export interface NaverDatalabPopularKeywordRank {
  rank: number;
  keyword: string;
  linkId: string | null;
  categories: string[];
  isNew?: boolean;
  previousRank?: number | null;
  rankDelta?: number | null;
}

export interface NaverDatalabPopularKeywordBoard {
  key: NaverDatalabPopularKeywordBoardKey;
  label: string;
  cid: number | null;
  categoryPath: string;
  date: string;
  datetime: string;
  range: string;
  ranks: NaverDatalabPopularKeywordRank[];
  error?: string | null;
}

export interface SearchNaverDatalabPopularKeywordsResult {
  source: 'naver-datalab-shopping-keyword-rank';
  timeUnit: NaverDatalabTimeUnit;
  startDate: string;
  endDate: string;
  device: NaverDatalabDevice | null;
  gender: NaverDatalabGender | null;
  ages: string[];
  generatedAt: string;
  boards: NaverDatalabPopularKeywordBoard[];
}

export type KeywordAnalysisAction = 'trend_agent' | 'popular' | 'compare' | 'related';
export type KeywordAnalysisFocusMode = 'all' | 'toy_stationery' | 'kids';

export interface KeywordAnalysisInput extends Record<string, unknown> {
  action: KeywordAnalysisAction;
  keyword?: string;
  keywords?: string[];
  timeUnit: NaverDatalabTimeUnit;
  gender: 'all' | NaverDatalabGender;
  age: string;
  device: 'all' | NaverDatalabDevice;
  selectedBoardKey: string;
  rankLimit: number;
  focusMode: KeywordAnalysisFocusMode;
  finalLimit: number;
}

export interface KeywordAnalysisSnapshot {
  version: 'naver-keyword-analysis/v1';
  generatedAt: string;
  input: KeywordAnalysisInput;
  result: {
    popular: SearchNaverDatalabPopularKeywordsResult | null;
    related: SearchNaverRelatedKeywordsResult | null;
    autocomplete: SearchNaverAutocompleteKeywordsResult[];
    trends: CompareNaverDatalabSearchTrendsResult | null;
  };
}

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
  return apiClient.getNullable<KeywordAnalysisSnapshot>(
    `/api/sourcing/keyword-analysis/snapshot?input=${query}`,
  );
}
