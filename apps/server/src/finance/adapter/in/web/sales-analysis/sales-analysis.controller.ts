import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import type {
  SalesAnalysisData,
  SalesAnalysisDataSources,
} from '@kiditem/shared/finance';
import { SalesAnalysisService } from '../../../../application/service/sales-analysis/sales-analysis.service';
import { SalesAnalysisScraperService } from '../../../../application/service/sales-analysis/sales-analysis-scraper.service';
import { SalesAnalysisQueryDto } from './dto/sales-analysis-query.dto';

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
    return this.salesAnalysisService.getAnalysis(organizationId, query.period, new Date());
  }

  @Get('data-sources')
  async getDataSources(
    @CurrentOrganization() organizationId: string,
  ): Promise<SalesAnalysisDataSources> {
    return this.scraperService.getDataSources(organizationId);
  }
}
