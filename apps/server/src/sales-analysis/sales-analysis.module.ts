import { Module } from '@nestjs/common';
import { SalesAnalysisController } from './sales-analysis.controller';
import { SalesAnalysisService } from './sales-analysis.service';

@Module({
  controllers: [SalesAnalysisController],
  providers: [SalesAnalysisService],
})
export class SalesAnalysisModule {}
