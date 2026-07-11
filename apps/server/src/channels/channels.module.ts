import { Module } from '@nestjs/common';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AutomationModule } from '../automation/automation.module';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ChannelRegistrationCapabilityAdapter } from './adapter/in/agent/channel-registration-capability.adapter';
import { ChannelSyncController } from './adapter/in/http/channel-sync.controller';
import { ChannelDashboardController } from './adapter/in/http/channel-dashboard.controller';
import { ChannelAccountController } from './adapter/in/http/channel-account.controller';
import { ChannelAccountListController } from './adapter/in/http/channel-account-list.controller';
import { ChannelListingController } from './adapter/in/http/channel-listing.controller';
import { ChannelCatalogImportController } from './adapter/in/http/channel-catalog-import.controller';
import { ChannelSkuMappingController } from './adapter/in/http/channel-sku-mapping.controller';
import { ChannelSkuAvailabilityController } from './adapter/in/http/channel-sku-availability.controller';
import { CoupangProviderAdapter } from './adapter/out/coupang/coupang-provider.adapter';
import { ChannelAccountRepositoryAdapter } from './adapter/out/repository/channel-account.repository.adapter';
import { ChannelDashboardRepositoryAdapter } from './adapter/out/repository/channel-dashboard.repository.adapter';
import { ChannelListingRepositoryAdapter } from './adapter/out/repository/channel-listing.repository.adapter';
import { MarketplaceRegistrationRepositoryAdapter } from './adapter/out/repository/marketplace-registration.repository.adapter';
import { ChannelsProductMasterBarcodeAdapter } from './adapter/out/products/product-master-barcode.adapter';
import { ChannelRegistrationRuntimeHandler } from './adapter/out/runtime/channel-registration-runtime.handler';
import { ChannelSyncRepositoryAdapter } from './adapter/out/repository/channel-sync.repository.adapter';
import { ChannelCatalogImportRepositoryAdapter } from './adapter/out/repository/channel-catalog-import.repository.adapter';
import { ChannelSkuMappingRepositoryAdapter } from './adapter/out/repository/channel-sku-mapping.repository.adapter';
import { ChannelsInventorySkuReadAdapter } from './adapter/out/inventory/inventory-sku-read.adapter';
import { ChannelSyncService } from './application/service/channel-sync.service';
import { ChannelDashboardService } from './application/service/channel-dashboard.service';
import { ChannelListingQueryService } from './application/service/channel-listing-query.service';
import { ChannelAccountQueryService } from './application/service/channel-account-query.service';
import { MarketplaceRegistrationService } from './application/service/marketplace-registration.service';
import { ChannelAccountService } from './application/service/channel-account.service';
import { ChannelCatalogImportService } from './application/service/channel-catalog-import.service';
import { ChannelSkuMappingService } from './application/service/channel-sku-mapping.service';
import { ChannelSkuAvailabilityService } from './application/service/channel-sku-availability.service';
import { COUPANG_PROVIDER_PORT } from './application/port/out/provider/coupang-provider.port';
import { ChannelsOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { CHANNELS_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';
import { CHANNELS_PRODUCT_MASTER_BARCODE_PORT } from './application/port/out/cross-domain/product-master-barcode.port';
import { CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT } from './application/port/in/capability/marketplace-registration.port';
import { CHANNEL_CATALOG_IMPORT_PORT } from './application/port/in/channel-catalog-import.port';
import {
  CHANNEL_ACCOUNT_REPOSITORY_PORT,
  COUPANG_CREDENTIALS_PORT,
} from './application/port/out/repository/channel-account.repository.port';
import { CHANNEL_DASHBOARD_REPOSITORY_PORT } from './application/port/out/repository/channel-dashboard.repository.port';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
} from './application/port/out/repository/channel-listing.repository.port';
import { CHANNEL_SYNC_REPOSITORY_PORT } from './application/port/out/repository/channel-sync.repository.port';
import { CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT } from './application/port/out/repository/channel-catalog-import.repository.port';
import { CHANNEL_SKU_MAPPING_REPOSITORY_PORT } from './application/port/out/repository/channel-sku-mapping.repository.port';
import { CHANNELS_INVENTORY_SKU_READ_PORT } from './application/port/out/cross-domain/inventory-sku-read.port';
import { CHANNEL_SKU_AVAILABILITY_PORT } from './application/port/in/channel-sku-availability.port';

@Module({
  imports: [AgentOsModule, AutomationModule, ProductsModule, InventoryModule],
  controllers: [
    ChannelSyncController,
    ChannelDashboardController,
    ChannelAccountController,
    ChannelAccountListController,
    ChannelListingController,
    ChannelCatalogImportController,
    ChannelSkuMappingController,
    ChannelSkuAvailabilityController,
  ],
  providers: [
    ChannelSyncService,
    ChannelDashboardService,
    ChannelListingQueryService,
    ChannelAccountQueryService,
    MarketplaceRegistrationService,
    ChannelAccountService,
    ChannelCatalogImportService,
    ChannelSkuMappingService,
    ChannelSkuAvailabilityService,
    ChannelRegistrationCapabilityAdapter,
    ChannelRegistrationRuntimeHandler,
    CoupangProviderAdapter,
    ChannelsOperationAlertAdapter,
    ChannelsProductMasterBarcodeAdapter,
    ChannelAccountRepositoryAdapter,
    ChannelDashboardRepositoryAdapter,
    ChannelListingRepositoryAdapter,
    MarketplaceRegistrationRepositoryAdapter,
    ChannelSyncRepositoryAdapter,
    ChannelCatalogImportRepositoryAdapter,
    ChannelSkuMappingRepositoryAdapter,
    ChannelsInventorySkuReadAdapter,
    { provide: COUPANG_PROVIDER_PORT, useExisting: CoupangProviderAdapter },
    { provide: CHANNELS_OPERATION_ALERT_PORT, useExisting: ChannelsOperationAlertAdapter },
    {
      provide: CHANNELS_PRODUCT_MASTER_BARCODE_PORT,
      useExisting: ChannelsProductMasterBarcodeAdapter,
    },
    { provide: CHANNEL_ACCOUNT_REPOSITORY_PORT, useExisting: ChannelAccountRepositoryAdapter },
    { provide: COUPANG_CREDENTIALS_PORT, useExisting: ChannelAccountRepositoryAdapter },
    { provide: CHANNEL_DASHBOARD_REPOSITORY_PORT, useExisting: ChannelDashboardRepositoryAdapter },
    { provide: CHANNEL_LISTING_REPOSITORY_PORT, useExisting: ChannelListingRepositoryAdapter },
    {
      provide: MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
      useExisting: MarketplaceRegistrationRepositoryAdapter,
    },
    {
      provide: CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
      useExisting: ChannelRegistrationCapabilityAdapter,
    },
    { provide: CHANNEL_SYNC_REPOSITORY_PORT, useExisting: ChannelSyncRepositoryAdapter },
    {
      provide: CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT,
      useExisting: ChannelCatalogImportRepositoryAdapter,
    },
    {
      provide: CHANNEL_CATALOG_IMPORT_PORT,
      useExisting: ChannelCatalogImportService,
    },
    {
      provide: CHANNEL_SKU_MAPPING_REPOSITORY_PORT,
      useExisting: ChannelSkuMappingRepositoryAdapter,
    },
    {
      provide: CHANNELS_INVENTORY_SKU_READ_PORT,
      useExisting: ChannelsInventorySkuReadAdapter,
    },
    {
      provide: CHANNEL_SKU_AVAILABILITY_PORT,
      useExisting: ChannelSkuAvailabilityService,
    },
  ],
  exports: [COUPANG_PROVIDER_PORT, CHANNEL_SKU_AVAILABILITY_PORT],
})
export class ChannelsModule {}
