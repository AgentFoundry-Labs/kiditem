export const SOURCING_NAVER_KEYWORD_RESEARCH_PORT = Symbol('SOURCING_NAVER_KEYWORD_RESEARCH_PORT');
export const SOURCING_NAVER_DATALAB_TREND_PORT = Symbol('SOURCING_NAVER_DATALAB_TREND_PORT');
export const SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT = Symbol(
  'SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT',
);
export const SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT = Symbol('SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT');

export interface NaverKeywordResearchStatus {
  configured: boolean;
  requiredEnv: string[];
}

export interface NaverDatalabTrendStatus {
  configured: boolean;
  requiredEnv: string[];
}

export interface SearchNaverRelatedKeywordsInput {
  seedKeywords: string[];
  maxResults?: number;
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
  raw: Record<string, unknown>;
}

export interface SearchNaverRelatedKeywordsResult {
  source: 'naver-searchad-keywordstool';
  seedKeywords: string[];
  generatedAt: string;
  items: NaverRelatedKeyword[];
}

export interface NaverKeywordResearchPort {
  getStatus(): NaverKeywordResearchStatus;
  searchRelatedKeywords(input: SearchNaverRelatedKeywordsInput): Promise<SearchNaverRelatedKeywordsResult>;
}

export type NaverDatalabTimeUnit = 'date' | 'week' | 'month';
export type NaverDatalabDevice = 'pc' | 'mo';
export type NaverDatalabGender = 'm' | 'f';
export type NaverDatalabPopularKeywordBoardKey =
  | 'all_categories'
  | 'birth_kids'
  | 'toys_dolls'
  | 'stationery_office'
  | 'kids_fashion';

export interface CompareNaverDatalabSearchTrendsInput {
  keywords: string[];
  startDate?: string;
  endDate?: string;
  timeUnit?: NaverDatalabTimeUnit;
  device?: NaverDatalabDevice;
  gender?: NaverDatalabGender;
  ages?: string[];
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

export interface NaverDatalabTrendPort {
  getStatus(): NaverDatalabTrendStatus;
  compareSearchTrends(
    input: CompareNaverDatalabSearchTrendsInput,
  ): Promise<CompareNaverDatalabSearchTrendsResult>;
}

export interface SearchNaverDatalabPopularKeywordsInput {
  boardKeys?: NaverDatalabPopularKeywordBoardKey[];
  timeUnit?: NaverDatalabTimeUnit;
  startDate?: string;
  endDate?: string;
  device?: NaverDatalabDevice;
  gender?: NaverDatalabGender;
  ages?: string[];
  limit?: number;
}

export interface NaverDatalabPopularKeywordRank {
  rank: number;
  keyword: string;
  linkId: string | null;
  categories: string[];
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

export interface NaverDatalabPopularKeywordPort {
  searchPopularKeywords(
    input: SearchNaverDatalabPopularKeywordsInput,
  ): Promise<SearchNaverDatalabPopularKeywordsResult>;
}

export interface SearchNaverAutocompleteKeywordsInput {
  keyword: string;
  maxResults?: number;
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

export interface NaverAutocompleteKeywordPort {
  searchAutocompleteKeywords(
    input: SearchNaverAutocompleteKeywordsInput,
  ): Promise<SearchNaverAutocompleteKeywordsResult>;
}
