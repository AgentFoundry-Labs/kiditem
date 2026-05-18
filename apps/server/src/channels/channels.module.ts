import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { ChannelSyncController } from './adapter/in/http/channel-sync.controller';
import { ChannelDashboardController } from './adapter/in/http/channel-dashboard.controller';
import { ChannelReconciliationController } from './adapter/in/http/channel-reconciliation.controller';
import { ChannelAccountController } from './adapter/in/http/channel-account.controller';
import { ChannelAccountListController } from './adapter/in/http/channel-account-list.controller';
import { ChannelListingController } from './adapter/in/http/channel-listing.controller';
import { CoupangProviderAdapter } from './adapter/out/coupang/coupang-provider.adapter';
import { ChannelAccountRepositoryAdapter } from './adapter/out/repository/channel-account.repository.adapter';
import { ChannelDashboardRepositoryAdapter } from './adapter/out/repository/channel-dashboard.repository.adapter';
import { ChannelListingRepositoryAdapter } from './adapter/out/repository/channel-listing.repository.adapter';
import { MarketplaceRegistrationRepositoryAdapter } from './adapter/out/repository/marketplace-registration.repository.adapter';
import { ChannelSyncRepositoryAdapter } from './adapter/out/repository/channel-sync.repository.adapter';
import { ChannelReconciliationMatcherRepositoryAdapter } from './adapter/out/repository/channel-reconciliation-matcher.repository.adapter';
import { ChannelReconciliationQueryRepositoryAdapter } from './adapter/out/repository/channel-reconciliation-query.repository.adapter';
import { ChannelReconciliationResolutionRepositoryAdapter } from './adapter/out/repository/channel-reconciliation-resolution.repository.adapter';
import { ChannelReconciliationScanRepositoryAdapter } from './adapter/out/repository/channel-reconciliation-scan.repository.adapter';
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
import { ChannelsOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { CHANNELS_OPERATION_ALERT_PORT } from './application/port/out/operation-alert.port';
import {
  CHANNEL_ACCOUNT_REPOSITORY_PORT,
  COUPANG_CREDENTIALS_PORT,
} from './application/port/out/channel-account.repository.port';
import { CHANNEL_DASHBOARD_REPOSITORY_PORT } from './application/port/out/channel-dashboard.repository.port';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
} from './application/port/out/channel-listing.repository.port';
import { CHANNEL_SYNC_REPOSITORY_PORT } from './application/port/out/channel-sync.repository.port';
import {
  CHANNEL_RECONCILIATION_MATCHER_PORT,
  CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT,
  CHANNEL_RECONCILIATION_RESOLUTION_REPOSITORY_PORT,
  CHANNEL_RECONCILIATION_SCAN_REPOSITORY_PORT,
} from './application/port/out/channel-reconciliation.repository.port';

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
    ChannelsOperationAlertAdapter,
    ChannelAccountRepositoryAdapter,
    ChannelDashboardRepositoryAdapter,
    ChannelListingRepositoryAdapter,
    MarketplaceRegistrationRepositoryAdapter,
    ChannelSyncRepositoryAdapter,
    ChannelReconciliationMatcherRepositoryAdapter,
    ChannelReconciliationQueryRepositoryAdapter,
    ChannelReconciliationResolutionRepositoryAdapter,
    ChannelReconciliationScanRepositoryAdapter,
    { provide: COUPANG_PROVIDER_PORT, useExisting: CoupangProviderAdapter },
    { provide: CHANNELS_OPERATION_ALERT_PORT, useExisting: ChannelsOperationAlertAdapter },
    { provide: CHANNEL_ACCOUNT_REPOSITORY_PORT, useExisting: ChannelAccountRepositoryAdapter },
    { provide: COUPANG_CREDENTIALS_PORT, useExisting: ChannelAccountRepositoryAdapter },
    { provide: CHANNEL_DASHBOARD_REPOSITORY_PORT, useExisting: ChannelDashboardRepositoryAdapter },
    { provide: CHANNEL_LISTING_REPOSITORY_PORT, useExisting: ChannelListingRepositoryAdapter },
    {
      provide: MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
      useExisting: MarketplaceRegistrationRepositoryAdapter,
    },
    { provide: CHANNEL_SYNC_REPOSITORY_PORT, useExisting: ChannelSyncRepositoryAdapter },
    {
      provide: CHANNEL_RECONCILIATION_MATCHER_PORT,
      useExisting: ChannelReconciliationMatcherRepositoryAdapter,
    },
    {
      provide: CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT,
      useExisting: ChannelReconciliationQueryRepositoryAdapter,
    },
    {
      provide: CHANNEL_RECONCILIATION_RESOLUTION_REPOSITORY_PORT,
      useExisting: ChannelReconciliationResolutionRepositoryAdapter,
    },
    {
      provide: CHANNEL_RECONCILIATION_SCAN_REPOSITORY_PORT,
      useExisting: ChannelReconciliationScanRepositoryAdapter,
    },
  ],
  exports: [ChannelReconciliationService, COUPANG_PROVIDER_PORT],
})
export class ChannelsModule {}
