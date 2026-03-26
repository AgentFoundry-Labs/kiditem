import { Module } from '@nestjs/common';
import { CoupangDashboardController } from './coupang-dashboard.controller';
import { CoupangDashboardService } from './coupang-dashboard.service';

@Module({
  controllers: [CoupangDashboardController],
  providers: [CoupangDashboardService],
})
export class CoupangDashboardModule {}
