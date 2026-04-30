import { Module } from '@nestjs/common';
import { ChannelSyncController } from './adapter/in/http/channel-sync.controller';
import { ChannelDashboardController } from './adapter/in/http/channel-dashboard.controller';
import { CoupangProviderAdapter } from './adapter/out/coupang/coupang-provider.adapter';
import { ChannelSyncService } from './application/service/channel-sync.service';
import { ChannelDashboardService } from './application/service/channel-dashboard.service';
import { COUPANG_PROVIDER_PORT } from './application/port/out/coupang-provider.port';

@Module({
  controllers: [ChannelSyncController, ChannelDashboardController],
  providers: [
    ChannelSyncService,
    ChannelDashboardService,
    CoupangProviderAdapter,
    { provide: COUPANG_PROVIDER_PORT, useExisting: CoupangProviderAdapter },
  ],
})
export class ChannelsModule {}
