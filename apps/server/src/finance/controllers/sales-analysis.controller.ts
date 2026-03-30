import { Controller, Get, Query } from '@nestjs/common';
import { SalesAnalysisService } from '../services/sales-analysis.service';

@Controller('sales-analysis')
export class SalesAnalysisController {
  constructor(
    private readonly salesAnalysisService: SalesAnalysisService,
  ) {}

  @Get()
  getAnalysis(@Query('period') period?: string) {
    return this.salesAnalysisService.getAnalysis(period);
  }
}
