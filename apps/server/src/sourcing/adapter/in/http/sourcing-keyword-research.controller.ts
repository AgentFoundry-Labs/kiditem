import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { NaverKeywordResearchService } from '../../../application/service/naver-keyword-research.service';
import {
  CompareNaverDatalabSearchTrendsDto,
  SearchNaverAutocompleteKeywordsDto,
  SearchNaverDatalabPopularKeywordsDto,
  SearchNaverRelatedKeywordsDto,
} from './dto';

@Controller('sourcing/keyword-research/naver')
export class SourcingKeywordResearchController {
  constructor(private readonly naverKeywordResearch: NaverKeywordResearchService) {}

  @Get('status')
  status(@CurrentOrganization() _organizationId: string) {
    return this.naverKeywordResearch.getStatus();
  }

  @Post('related-keywords')
  searchRelatedKeywords(
    @Body() body: SearchNaverRelatedKeywordsDto,
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.naverKeywordResearch.searchRelatedKeywords(organizationId, body, idempotencyKey);
  }

  @Post('autocomplete-keywords')
  searchAutocompleteKeywords(
    @Body() body: SearchNaverAutocompleteKeywordsDto,
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.naverKeywordResearch.searchAutocompleteKeywords(organizationId, body, idempotencyKey);
  }

  @Get('datalab/status')
  datalabStatus(@CurrentOrganization() _organizationId: string) {
    return this.naverKeywordResearch.getDatalabStatus();
  }

  @Post('datalab/search-trends')
  compareSearchTrends(
    @Body() body: CompareNaverDatalabSearchTrendsDto,
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.naverKeywordResearch.compareSearchTrends(organizationId, body, idempotencyKey);
  }

  @Post('datalab/popular-keywords')
  searchPopularKeywords(
    @Body() body: SearchNaverDatalabPopularKeywordsDto,
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.naverKeywordResearch.searchPopularKeywords(body, organizationId, idempotencyKey);
  }
}
