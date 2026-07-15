import { apiClient } from '@/lib/api-client';

export interface NaverKeywordResearchStatus {
  configured: boolean;
  requiredEnv: string[];
}

export interface NaverDatalabTrendStatus {
  configured: boolean;
  requiredEnv: string[];
}

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
  timeUnit: 'date' | 'week' | 'month';
  generatedAt: string;
  items: NaverDatalabKeywordTrend[];
}

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

export function getNaverKeywordResearchStatus(): Promise<NaverKeywordResearchStatus> {
  return apiClient.get<NaverKeywordResearchStatus>('/api/sourcing/keyword-research/naver/status');
}

export function getNaverDatalabTrendStatus(): Promise<NaverDatalabTrendStatus> {
  return apiClient.get<NaverDatalabTrendStatus>('/api/sourcing/keyword-research/naver/datalab/status');
}

export function searchNaverRelatedKeywords(input: {
  seedKeywords: string[];
  maxResults?: number;
}): Promise<SearchNaverRelatedKeywordsResult> {
  return apiClient.post<SearchNaverRelatedKeywordsResult>(
    '/api/sourcing/keyword-research/naver/related-keywords',
    input,
  );
}

export function searchNaverAutocompleteKeywords(input: {
  keyword: string;
  maxResults?: number;
}): Promise<SearchNaverAutocompleteKeywordsResult> {
  return apiClient.post<SearchNaverAutocompleteKeywordsResult>(
    '/api/sourcing/keyword-research/naver/autocomplete-keywords',
    input,
  );
}

export function compareNaverDatalabSearchTrends(input: {
  keywords: string[];
  startDate?: string;
  endDate?: string;
  timeUnit?: NaverDatalabTimeUnit;
  gender?: NaverDatalabGender;
  device?: NaverDatalabDevice;
  ages?: string[];
}): Promise<CompareNaverDatalabSearchTrendsResult> {
  return apiClient.post<CompareNaverDatalabSearchTrendsResult>(
    '/api/sourcing/keyword-research/naver/datalab/search-trends',
    input,
  );
}

export function searchNaverDatalabPopularKeywords(input: {
  boardKeys?: NaverDatalabPopularKeywordBoardKey[];
  startDate?: string;
  endDate?: string;
  timeUnit?: NaverDatalabTimeUnit;
  gender?: NaverDatalabGender;
  device?: NaverDatalabDevice;
  ages?: string[];
  limit?: number;
}): Promise<SearchNaverDatalabPopularKeywordsResult> {
  return apiClient.post<SearchNaverDatalabPopularKeywordsResult>(
    '/api/sourcing/keyword-research/naver/datalab/popular-keywords',
    input,
  );
}
