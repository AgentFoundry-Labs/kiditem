import { Controller, Get, Query } from '@nestjs/common';
import { SalesAnalysisService } from '../services/sales-analysis.service';
import { SalesAnalysisQueryDto } from '../dto';

@Controller('sales-analysis')
export class SalesAnalysisController {
  constructor(
    private readonly salesAnalysisService: SalesAnalysisService,
  ) {}

  @Get()
  getAnalysis(@Query() query: SalesAnalysisQueryDto) {
    return this.salesAnalysisService.getAnalysis(query.period);
  }
}
