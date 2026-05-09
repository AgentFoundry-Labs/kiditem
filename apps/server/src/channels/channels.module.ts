import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { ChannelSyncController } from './adapter/in/http/channel-sync.controller';
import { ChannelDashboardController } from './adapter/in/http/channel-dashboard.controller';
import { ChannelReconciliationController } from './adapter/in/http/channel-reconciliation.controller';
import { ChannelAccountController } from './adapter/in/http/channel-account.controller';
import { CoupangProviderAdapter } from './adapter/out/coupang/coupang-provider.adapter';
import { ChannelSyncService } from './application/service/channel-sync.service';
import { ChannelDashboardService } from './application/service/channel-dashboard.service';
import { ChannelReconciliationService } from './application/service/channel-reconciliation.service';
import { ChannelAccountService } from './application/service/channel-account.service';
import { COUPANG_PROVIDER_PORT } from './application/port/out/coupang-provider.port';

@Module({
  imports: [AutomationModule],
  controllers: [
    ChannelSyncController,
    ChannelDashboardController,
    ChannelReconciliationController,
    ChannelAccountController,
  ],
  providers: [
    ChannelSyncService,
    ChannelDashboardService,
    ChannelReconciliationService,
    ChannelAccountService,
    CoupangProviderAdapter,
    { provide: COUPANG_PROVIDER_PORT, useExisting: CoupangProviderAdapter },
  ],
  exports: [ChannelReconciliationService, COUPANG_PROVIDER_PORT],
})
export class ChannelsModule {}
