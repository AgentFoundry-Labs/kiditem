import { Body, Controller, Get, Post } from '@nestjs/common';
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
    @CurrentOrganization() _organizationId: string,
  ) {
    return this.naverKeywordResearch.searchRelatedKeywords(body);
  }

  @Post('autocomplete-keywords')
  searchAutocompleteKeywords(
    @Body() body: SearchNaverAutocompleteKeywordsDto,
    @CurrentOrganization() _organizationId: string,
  ) {
    return this.naverKeywordResearch.searchAutocompleteKeywords(body);
  }

  @Get('datalab/status')
  datalabStatus(@CurrentOrganization() _organizationId: string) {
    return this.naverKeywordResearch.getDatalabStatus();
  }

  @Post('datalab/search-trends')
  compareSearchTrends(
    @Body() body: CompareNaverDatalabSearchTrendsDto,
    @CurrentOrganization() _organizationId: string,
  ) {
    return this.naverKeywordResearch.compareSearchTrends(body);
  }

  @Post('datalab/popular-keywords')
  searchPopularKeywords(
    @Body() body: SearchNaverDatalabPopularKeywordsDto,
    @CurrentOrganization() _organizationId: string,
  ) {
    return this.naverKeywordResearch.searchPopularKeywords(body);
  }
}
