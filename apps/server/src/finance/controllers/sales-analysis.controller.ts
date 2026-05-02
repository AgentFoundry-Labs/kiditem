import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import type {
  SalesAnalysisAdsMonthly,
  SalesAnalysisData,
  SalesAnalysisDataSources,
} from '@kiditem/shared/finance';
import { SalesAnalysisService } from '../services/sales-analysis.service';
import { SalesAnalysisScraperService } from '../services/sales-analysis-scraper.service';
import { SalesAnalysisQueryDto } from '../dto/sales-analysis-query.dto';
import { SalesAnalysisAdsMonthlyQueryDto } from '../dto/sales-analysis-ads-monthly.dto';

@Controller('sales-analysis')
export class SalesAnalysisController {
  constructor(
    private readonly salesAnalysisService: SalesAnalysisService,
    private readonly scraperService: SalesAnalysisScraperService,
  ) {}

  @Get()
  async getAnalysis(
    @CurrentOrganization() organizationId: string,
    @Query() query: SalesAnalysisQueryDto,
  ): Promise<SalesAnalysisData> {
    return this.salesAnalysisService.getAnalysis(organizationId, query.period);
  }

  @Get('data-sources')
  async getDataSources(
    @CurrentOrganization() organizationId: string,
  ): Promise<SalesAnalysisDataSources> {
    return this.scraperService.getDataSources(organizationId);
  }

  @Get('ads/monthly')
  async getAdsMonthly(
    @CurrentOrganization() organizationId: string,
    @Query() query: SalesAnalysisAdsMonthlyQueryDto,
  ): Promise<SalesAnalysisAdsMonthly> {
    return this.scraperService.getMonthlyAds(
      organizationId,
      query.year,
      query.month,
    );
  }
}
