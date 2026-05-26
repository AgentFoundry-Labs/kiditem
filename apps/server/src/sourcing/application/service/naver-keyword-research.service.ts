import { Inject, Injectable } from '@nestjs/common';
import {
  SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
  SOURCING_NAVER_DATALAB_TREND_PORT,
  SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
  SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
  type CompareNaverDatalabSearchTrendsInput,
  type CompareNaverDatalabSearchTrendsResult,
  type NaverAutocompleteKeywordPort,
  type NaverDatalabPopularKeywordPort,
  type NaverDatalabTrendPort,
  type NaverDatalabTrendStatus,
  type NaverKeywordResearchPort,
  type NaverKeywordResearchStatus,
  type SearchNaverAutocompleteKeywordsInput,
  type SearchNaverAutocompleteKeywordsResult,
  type SearchNaverDatalabPopularKeywordsInput,
  type SearchNaverDatalabPopularKeywordsResult,
  type SearchNaverRelatedKeywordsInput,
  type SearchNaverRelatedKeywordsResult,
} from '../port/out/provider/naver-keyword-research.port';

@Injectable()
export class NaverKeywordResearchService {
  constructor(
    @Inject(SOURCING_NAVER_KEYWORD_RESEARCH_PORT)
    private readonly keywordResearch: NaverKeywordResearchPort,
    @Inject(SOURCING_NAVER_DATALAB_TREND_PORT)
    private readonly datalabTrend: NaverDatalabTrendPort,
    @Inject(SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT)
    private readonly popularKeywords: NaverDatalabPopularKeywordPort,
    @Inject(SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT)
    private readonly autocompleteKeywords: NaverAutocompleteKeywordPort,
  ) {}

  getStatus(): NaverKeywordResearchStatus {
    return this.keywordResearch.getStatus();
  }

  getDatalabStatus(): NaverDatalabTrendStatus {
    return this.datalabTrend.getStatus();
  }

  searchRelatedKeywords(input: SearchNaverRelatedKeywordsInput): Promise<SearchNaverRelatedKeywordsResult> {
    return this.keywordResearch.searchRelatedKeywords(input);
  }

  compareSearchTrends(
    input: CompareNaverDatalabSearchTrendsInput,
  ): Promise<CompareNaverDatalabSearchTrendsResult> {
    return this.datalabTrend.compareSearchTrends(input);
  }

  searchPopularKeywords(
    input: SearchNaverDatalabPopularKeywordsInput,
  ): Promise<SearchNaverDatalabPopularKeywordsResult> {
    return this.popularKeywords.searchPopularKeywords(input);
  }

  searchAutocompleteKeywords(
    input: SearchNaverAutocompleteKeywordsInput,
  ): Promise<SearchNaverAutocompleteKeywordsResult> {
    return this.autocompleteKeywords.searchAutocompleteKeywords(input);
  }
}
