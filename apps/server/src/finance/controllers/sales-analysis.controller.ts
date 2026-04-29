import { Controller, Get, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import type { SalesAnalysisData } from '@kiditem/shared/finance';
import { SalesAnalysisService } from '../services/sales-analysis.service';
import { SalesAnalysisQueryDto } from '../dto/sales-analysis-query.dto';

@Controller('sales-analysis')
export class SalesAnalysisController {
  constructor(private readonly salesAnalysisService: SalesAnalysisService) {}

  @Get()
  async getAnalysis(
    @CurrentCompany() companyId: string,
    @Query() query: SalesAnalysisQueryDto,
  ): Promise<SalesAnalysisData> {
    return this.salesAnalysisService.getAnalysis(companyId, query.period);
  }
}
