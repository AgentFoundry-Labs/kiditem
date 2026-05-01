import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import type { SalesAnalysisData } from '@kiditem/shared/finance';
import { SalesAnalysisService } from '../services/sales-analysis.service';
import { SalesAnalysisQueryDto } from '../dto/sales-analysis-query.dto';

@Controller('sales-analysis')
export class SalesAnalysisController {
  constructor(private readonly salesAnalysisService: SalesAnalysisService) {}

  @Get()
  async getAnalysis(
    @CurrentOrganization() organizationId: string,
    @Query() query: SalesAnalysisQueryDto,
  ): Promise<SalesAnalysisData> {
    return this.salesAnalysisService.getAnalysis(organizationId, query.period);
  }
}
