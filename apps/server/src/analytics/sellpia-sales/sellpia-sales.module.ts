import { Module } from '@nestjs/common';
import { AlertsModule } from '../../alerts/alerts.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SellpiaSalesController } from './sellpia-sales.controller';
import { SellpiaSalesService } from './sellpia-sales.service';
import { SellpiaSalesSourceService } from './sellpia-sales-source.service';

// Sellpia 판매현황(sale_summary) 몰별 매출 ingest + read.
// analytics owner 의 daily-fact ingest 예외 레인(traffic upload 와 동일 성격).
// PrismaModule 은 @Global 이므로 별도 import 불필요.
@Module({
  imports: [DashboardModule, AlertsModule],
  controllers: [SellpiaSalesController],
  providers: [SellpiaSalesService, SellpiaSalesSourceService],
  exports: [SellpiaSalesSourceService],
})
export class SellpiaSalesModule {}
