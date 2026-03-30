import { Module } from '@nestjs/common';
import { CoupangSyncController } from './controllers/coupang-sync.controller';
import { CoupangSyncService } from './services/coupang-sync.service';
import { CoupangDashboardController } from './controllers/coupang-dashboard.controller';
import { CoupangDashboardService } from './services/coupang-dashboard.service';

@Module({
  controllers: [CoupangSyncController, CoupangDashboardController],
  providers: [CoupangSyncService, CoupangDashboardService],
})
export class CoupangModule {}
