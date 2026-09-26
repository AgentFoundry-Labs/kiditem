import { Module } from '@nestjs/common';
import { AlertsModule } from '../../alerts/alerts.module';
import { DashboardModule } from '../dashboard.module';
import { SellpiaSalesController } from './sellpia-sales.controller';
import { SellpiaSalesService } from './sellpia-sales.service';
import { SellpiaSalesOperationOwner } from '../adapter/in/operation/sellpia-sales-operation-owner';
import { SellpiaSalesPublicationRepository } from './sellpia-sales-publication.repository';

// Sellpia 판매현황(sale_summary) 몰별 매출 — 실행 kind `analytics.sellpia_sales`(KID-361 J2)의 발행 + read.
// analytics owner 의 daily-fact 쓰기 예외 레인(traffic upload 와 동일 성격).
// PrismaModule 은 @Global 이므로 별도 import 불필요.
@Module({
  imports: [DashboardModule, AlertsModule],
  controllers: [SellpiaSalesController],
  providers: [SellpiaSalesService, SellpiaSalesPublicationRepository, SellpiaSalesOperationOwner],
})
export class SellpiaSalesModule {}
