import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { ChannelSyncController } from './adapter/in/http/channel-sync.controller';
import { ChannelDashboardController } from './adapter/in/http/channel-dashboard.controller';
import { ChannelReconciliationController } from './adapter/in/http/channel-reconciliation.controller';
import { ChannelAccountController } from './adapter/in/http/channel-account.controller';
import { ChannelAccountListController } from './adapter/in/http/channel-account-list.controller';
import { ChannelListingController } from './adapter/in/http/channel-listing.controller';
import { CoupangProviderAdapter } from './adapter/out/coupang/coupang-provider.adapter';
import { ChannelSyncService } from './application/service/channel-sync.service';
import { ChannelDashboardService } from './application/service/channel-dashboard.service';
import { ChannelListingQueryService } from './application/service/channel-listing-query.service';
import { ChannelAccountQueryService } from './application/service/channel-account-query.service';
import { MarketplaceRegistrationService } from './application/service/marketplace-registration.service';
import { ChannelReconciliationMatcherService } from './application/service/channel-reconciliation-matcher.service';
import { ChannelReconciliationQueryService } from './application/service/channel-reconciliation-query.service';
import { ChannelReconciliationResolutionService } from './application/service/channel-reconciliation-resolution.service';
import { ChannelReconciliationScanService } from './application/service/channel-reconciliation-scan.service';
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
    ChannelAccountListController,
    ChannelListingController,
  ],
  providers: [
    ChannelSyncService,
    ChannelDashboardService,
    ChannelListingQueryService,
    ChannelAccountQueryService,
    MarketplaceRegistrationService,
    ChannelReconciliationMatcherService,
    ChannelReconciliationQueryService,
    ChannelReconciliationResolutionService,
    ChannelReconciliationScanService,
    ChannelReconciliationService,
    ChannelAccountService,
    CoupangProviderAdapter,
    { provide: COUPANG_PROVIDER_PORT, useExisting: CoupangProviderAdapter },
  ],
  exports: [ChannelReconciliationService, COUPANG_PROVIDER_PORT],
})
export class ChannelsModule {}
