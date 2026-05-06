import { Module } from '@nestjs/common';
import { ChannelSyncController } from './adapter/in/http/channel-sync.controller';
import { ChannelDashboardController } from './adapter/in/http/channel-dashboard.controller';
import { ChannelReconciliationController } from './adapter/in/http/channel-reconciliation.controller';
import { CoupangProviderAdapter } from './adapter/out/coupang/coupang-provider.adapter';
import { ChannelSyncService } from './application/service/channel-sync.service';
import { ChannelDashboardService } from './application/service/channel-dashboard.service';
import { ChannelReconciliationService } from './application/service/channel-reconciliation.service';
import { ChannelReconciliationSnapshotService } from './application/service/channel-reconciliation-snapshot.service';
import { ChannelReconciliationCatalogService } from './application/service/channel-reconciliation-catalog.service';
import { COUPANG_PROVIDER_PORT } from './application/port/out/coupang-provider.port';

@Module({
  controllers: [
    ChannelSyncController,
    ChannelDashboardController,
    ChannelReconciliationController,
  ],
  providers: [
    ChannelSyncService,
    ChannelDashboardService,
    ChannelReconciliationService,
    ChannelReconciliationSnapshotService,
    ChannelReconciliationCatalogService,
    CoupangProviderAdapter,
    { provide: COUPANG_PROVIDER_PORT, useExisting: CoupangProviderAdapter },
  ],
})
export class ChannelsModule {}
