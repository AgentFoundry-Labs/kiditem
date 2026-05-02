import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import type {
  SalesAnalysisData,
  SalesAnalysisDataSources,
} from '@kiditem/shared/finance';
import { SalesAnalysisService } from '../services/sales-analysis.service';
import { SalesAnalysisScraperService } from '../services/sales-analysis-scraper.service';
import { SalesAnalysisQueryDto } from '../dto/sales-analysis-query.dto';

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
}
