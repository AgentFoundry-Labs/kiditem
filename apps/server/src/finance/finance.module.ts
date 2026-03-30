import { Module } from '@nestjs/common';
import { ProfitLossController } from './controllers/profit-loss.controller';
import { ProfitLossService } from './services/profit-loss.service';
import { SalesAnalysisController } from './controllers/sales-analysis.controller';
import { SalesAnalysisService } from './services/sales-analysis.service';

@Module({
  controllers: [ProfitLossController, SalesAnalysisController],
  providers: [ProfitLossService, SalesAnalysisService],
})
export class FinanceModule {}
